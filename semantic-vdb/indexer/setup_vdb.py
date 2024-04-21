import pandas as pd
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance
from qdrant_client.http import models
from tqdm import tqdm
from time import sleep
# argparser
import argparse

# setup argparser
parser = argparse.ArgumentParser(description='Setup vector database')

parser.add_argument('--file', type=str, 
    default="lyrics-bert-embeddings-bm25.parquet.gzip", help='Path to qzip file')

parser.add_argument('--create', action="store_true", default=False, help='create collection')

args = parser.parse_args()
    
def search_largest_vector(path: str):
    """
    Search for the largest vector in qzip file
    
    :param path: path to qzip file

    :return: largest vector and its length
    """
    largest_vector = None
    largest_vector_length = 0

    df = pd.read_parquet(path, engine='pyarrow')

    for _, row in df.iterrows():

        vector = row['lyrics_bert_embedding']
        if len(vector) > largest_vector_length:
            largest_vector = vector
            largest_vector_length = len(vector)

    return largest_vector, largest_vector_length


def setup_vdb(max_len_vector: int):
    """
    Setup vector database
    """
    # Setup qdrant client
    client = QdrantClient("qdrant", timeout=100)

    # Create collection
    collection_name = "lyrics"

    if args.create:
        try:
            # Delete the collection
            client.delete_collection(collection_name=collection_name)
        except Exception as e:
            print(e)
            print(f"Collection {collection_name} does not exist")
            print("Creating collection")


        client.create_collection(
            collection_name,
            vectors_config={
                'text-dense':VectorParams(
                    size=max_len_vector,  # dimension
                    distance=Distance.COSINE  # distance
                )
            },
            sparse_vectors_config={
                "text-sparse": models.SparseVectorParams(
                    index=models.SparseIndexParams(
                        on_disk=False,
                    )
                )
            },
            optimizers_config=models.OptimizersConfigDiff(
                indexing_threshold=0,
            )
        )


        # Load data
        if args.file == "" or args.file is None:
            file = 'lyrics-bert-embeddings-bm25.parquet.gzip'
        else:
            file = args.file

        df = pd.read_parquet(
            file,
            engine='pyarrow'
        )

        # filter data
        df["length_lyrics"] = df["lyrics"].apply(lambda x: len(x.split()))
        df = df[df["length_lyrics"] > 50]

        tracks_meta = pd.read_csv("unique_tracks_final.csv", sep=";")
        topics = pd.read_csv("topics.csv", sep=";")

        # join data with tracks_meta where track meta is the left table
        df = tracks_meta.merge(df, on="track_uri", how="left")

        # assert length of df is the same as the length of tracks_meta
        assert len(df) == len(tracks_meta)

        ## make topic column in df integer
        df["topic"] = df["topic"].apply(lambda x: int(x))

        ## make topic_id column in topics integer
        topics["topic_id"] = topics["topic_id"].apply(lambda x: int(x))

        # join topics with topic column in df
        df = df.merge(topics, left_on="topic", right_on="topic_id", how="left")

        # drop columns
        df = df.drop(columns=['artist_name_y', 'track_name_y', 'lyrics_y'])

        # rename columns
        df = df.rename(columns={'artist_name_x': 'artist_name', 'track_name_x': 'track_name', 'lyrics_x': 'lyrics'})

        # filter rows where lyrics_bert_embedding is null
        df = df[df['lyrics_bert_embedding'].notnull()]

        # reset index
        df = df.reset_index(drop=True)

        # index array from df index
        index_array = list(df.index)

        # set track_uri as index
        df = df.set_index('track_uri')

        # vector array from df
        vector_array = df['lyrics_bert_embedding'].to_numpy()

        # sparse vector array from df
        sparse_vector_array = df['sparse_vector'].to_numpy()

        # payload array from lyric_csv
        payload_array = [
            {
                "artist_name": df.loc[track_uri, 'artist_name'],
                "track_name": df.loc[track_uri, 'track_name'],
                "track_uri": track_uri,
                "lyrics": df.loc[track_uri, 'lyrics'],
                "topic_id": int(df.loc[track_uri, 'topic']),
                "topic_words": str(df.loc[track_uri, 'words']),
                "topic_probs": str(df.loc[track_uri, 'probabilities']),
                "duration": str(df.loc[track_uri, 'duration_ms'])

            }
            for track_uri in tqdm(df.index)
        ]

        # assert that the length of index, vector and payload array are the same
        assert len(index_array) == len(vector_array) == len(payload_array)

        # assert that index array is unique and only of type int
        assert len(index_array) == len(set(index_array))
        assert all(isinstance(i, int) for i in index_array)

        # assert that vector array is of type np.ndarray
        assert all(isinstance(i, np.ndarray) for i in vector_array)

        # assert that payload array is of type dict
        assert all(isinstance(i, dict) for i in payload_array)

        # assert that payload array has the correct keys
        assert all(
            set(i.keys()) == {'artist_name', 'track_name', 'track_uri', \
                              'lyrics', 'topic_id', 'topic_words', 'topic_probs', 'duration'}
            for i in payload_array
        )

        # assert that payload array has the correct data types for the keys
        assert all(
            isinstance(i['artist_name'], str) and
            isinstance(i['track_name'], str) and
            isinstance(i['track_uri'], str) and
            isinstance(i['lyrics'], str) and
            isinstance(i['topic_id'], int) and
            isinstance(i['topic_words'], str) and
            isinstance(i['topic_probs'], str) and
            isinstance(i['duration'], str)
            for i in payload_array
        )


        # batch upsert with batch size of 10000
        batch_size = 1000
        batches = len(index_array) // 1000 + 1

        for i in tqdm(range(batches), desc="Batch upserting"):

            start = i * batch_size
            end = (i + 1) * batch_size

            points_list = []

            try:
                for j in range(start, end):

                    sparse_indices = sparse_vector_array[j]["indices"]
                    sparse_values = sparse_vector_array[j]["values"]

                    points_list.append(
                        models.PointStruct(
                            id=index_array[j],
                            payload=payload_array[j],
                            vector={
                                'text-dense': vector_array[j],
                                'text-sparse': models.SparseVector(
                                    indices=sparse_indices,
                                    values=sparse_values
                                )
                            }
                        )
                    )

                client.upsert(
                    collection_name=collection_name,
                    points=points_list
                )
            except Exception as e:
                print(e)
                print(f"Error upserting batch {i}")
                continue

        # create index

        client.update_collection(

            collection_name=collection_name,

            optimizers_config=models.OptimizersConfigDiff(
                indexing_threshold=20000,
            )

        )

        # create index for artist_name and track_name
        client.create_payload_index(
            collection_name=collection_name,
            field_name="artist_name",
            field_schema=models.TextIndexParams(
                type="text",
                tokenizer=models.TokenizerType.WORD,
                min_token_len=2,
                max_token_len=20,
                lowercase=True
            )
        )

        # create index for artist_name and track_name
        client.create_payload_index(
            collection_name=collection_name,
            field_name="track_name",
            field_schema=models.TextIndexParams(
                type="text",
                tokenizer=models.TokenizerType.WORD,
                min_token_len=2,
                max_token_len=20,
                lowercase=True
            )
        )

    if not args.create:
        print(f"Collection {collection_name} already exists else set --create flag to True")
        print("Skipping creation")

    return client, collection_name


if __name__ == '__main__':

    # Search for the largest vector in qzip file
    largest_vector, largest_vector_length = search_largest_vector(args.file)

    # print start setup
    print(f"Setting up vector database with largest vector length: {largest_vector_length}")
    client, collection_name = setup_vdb(largest_vector_length)
    print(f"Collection {collection_name} created and indexed")