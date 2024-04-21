from qdrant_client import QdrantClient
from sentence_transformers import SentenceTransformer, models
from pinecone_text.sparse import BM25Encoder
from qdrant_client.http import models as qdrant_models
from collections import deque

class NeuralSearcher:

    def __init__(self, collection_name):

        # Initialize the Qdrant client
        self.client = QdrantClient("qdrant", timeout=100)

        #  Set the collection name
        self.collection_name = collection_name

        #  Load the model
        model_name = 'brunokreiner/lyrics-bert'
        model = models.Transformer(model_name)
        pooling_model = models.Pooling(model.get_word_embedding_dimension())
        self.model = SentenceTransformer(modules=[model, pooling_model])

        bm25 = BM25Encoder()
        bm25.load('lyrics-bert-embeddings-bm25.pkl')
        self.bm25 = bm25
    

    def rerank_using_rsf(self, results_dense: list, results_sparse: list):
        """
        Rerank the results using RSF

        Args:
        - results_dense: list of dense search results
        - results_sparse: list of sparse search results

        Returns:
        - sorted_results: list of sorted results
        """
        # create a dictionary with the dense results
        dense_dict = {}

        for _, result in enumerate(results_dense):
            dense_dict[result.id] = {
                "score": result.score,
                "version": result.version,
            }

        # create a dictionary with the sparse results
        sparse_dict = {}

        for _, result in enumerate(results_sparse):
            sparse_dict[result.id] = {
                "score": result.score,
                "version": result.version,
            }

        only_scores_dense = [result.score for result in results_dense]
        only_scores_sparse = [result.score for result in results_sparse]

        min_score_dense = min(only_scores_dense)
        min_score_sparse = min(only_scores_sparse)
        max_score_dense = max(only_scores_dense)
        max_score_sparse = max(only_scores_sparse)

        # Normalize the scores
        norm_dense_dict = {
                key: (value["score"] - min_score_dense) / 
                (max_score_dense - min_score_dense) for key, value in dense_dict.items()
            }
        
        norm_sparse_dict = {
                key: (value["score"] - min_score_sparse) / 
                (max_score_sparse - min_score_sparse) for key, value in sparse_dict.items()
            }

        # Combine the normalized scores
        combined_scores = {}
        for key in set(norm_dense_dict.keys()).union(norm_sparse_dict.keys()):
            scores = [norm_dense_dict.get(key, 0), norm_sparse_dict.get(key, 0)]
            combined_scores[key] = sum(scores) / len(scores)

        # Sort and return the results based on combined scores
        sorted_results = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)

        # transform into list
        return sorted_results
    

    def retrieve_full_point_data(self, results: list):
        """
        Retrieve the full point data

        Args:
        - results: list of search results

        Returns:
        - data: dictionary of full point data
        """
        data = {}
        ids = [point[0] for point in results]
        scores = [point[1] for point in results]
    
        response = self.retrieve(ids)

        for record in response:
            data[record.id] = {
                "score": scores[ids.index(record.id)],
                "payload": record.payload,
            }

        return data


    def search(self, query: str, top_k: int = 5, 
               treshold: float = None, hybrid: bool = True):
        """
        Search for the nearest vectors
        """
        
        # Encode the query
        vector = self.model.encode(query).tolist()

        # bm25 encode the query
        bm25_data = self.bm25.encode_documents([query])
        inds = bm25_data[0]["indices"]
        vals = bm25_data[0]["values"]

        # Search for the nearest vectors
        if hybrid:
            search_results = self.client.search_batch(
                collection_name=self.collection_name,
                requests=[
                    qdrant_models.SearchRequest(
                        vector=qdrant_models.NamedVector(
                            name="text-dense",
                            vector=vector,
                        ),
                        limit=top_k,
                    ),
                    qdrant_models.SearchRequest(
                        vector=qdrant_models.NamedSparseVector(
                            name="text-sparse",
                            vector=qdrant_models.SparseVector(
                                indices=inds,
                                values=vals,
                            )
                        ),
                        limit=top_k,
                    )
                ]
            )
        else:
            search_results = self.client.search(
                collection_name=self.collection_name,
                query_vector=qdrant_models.NamedVector(
                    name="text-dense",
                    vector=vector,
                ),
                limit=top_k
            )

        # Rerank the results
        if hybrid:
            results = self.rerank_using_rsf(
                search_results[0], search_results[1]
            )
        else:
            results = [(result.id, result.score) for result in search_results]

        # Retrieve the full point data
        results = self.retrieve_full_point_data(results)

        if treshold is not None:
            # filter the results
            results = {
                key: value for key, value in results.items() if value["score"] >= treshold
            }

        # sort and filter the results using top_k
        keys = list(results.keys())
        scores = [results[key]["score"] for key in keys]
        sorted_indices = sorted(range(len(scores)), key=lambda k: scores[k], reverse=True)
        sorted_indices = sorted_indices[:top_k]
        results = {keys[i]: results[keys[i]] for i in sorted_indices}

        return results
    

    def retrieve(self, ids: list):
        """
        Retrieve a vector by id
        """
        return self.client.retrieve(
            collection_name=self.collection_name,
            ids=ids
        )
    

    def retrieve_graph(self, ids: list, top_k: int = 10, 
                        N: int = 25, treshold: float = 0.2, 
                        hybrid: bool = False):
        """
        Given a single id, retrieve a graph using the top_k nearest neighbors
        repeatedly until the graph has N nodes.
        """
        assert len(ids) == 1, "Only one id is allowed"

        nodes = set()  
        nodes_data = {}
        edges = set()

        # Retrieve the first node
        first_node = self.retrieve(ids)[0]
        nodes.add(first_node.id)
        nodes_data[first_node.id] = first_node.payload

        # Use a queue to manage BFS
        queue = deque([first_node.id])

        while len(nodes) < N and queue:
            current_node_id = queue.popleft()
            current_payload = nodes_data[current_node_id]

            # Retrieve nearest neighbors
            search_results = self.search(
                query=current_payload["lyrics"], top_k=top_k, 
                treshold=treshold, hybrid=hybrid)

            for neighbor_id in search_results.keys():
                # Avoid self-loops and re-adding existing nodes
                if neighbor_id == current_node_id or neighbor_id in nodes:
                    continue

                # Retrieve neighbor data once, store it, and add it to the queue for further exploration
                neighbor_data = self.retrieve([neighbor_id])[0].payload
                nodes.add(neighbor_id)
                nodes_data[neighbor_id] = neighbor_data
                edges.add((current_node_id, neighbor_id))

                if len(nodes) >= N:  # Break early if node limit is reached
                    break

                queue.append(neighbor_id)

        ## check for missing edges
        ## for each node retrieve search results
        ## check if any of the search results are in the nodes
        ## if so, add the edge if it is not already in the edges
        for node in nodes:
            search_results = self.search(
                query=nodes_data[node]["lyrics"], top_k=top_k, 
                treshold=treshold, hybrid=hybrid)

            for key in search_results.keys():
                if node != key:
                    if key in nodes:
                        if (node, key) not in edges:
                            edges.add((node, key))

        
        # clean the edges as it is undirected
        edges = [(start, end) for start, end in edges if start in nodes and end in nodes]

        # clean double edges


        # Convert sets back to lists for return, if necessary
        for edge in edges:
            switched_edge = (edge[1], edge[0])
            if switched_edge in edges:
                edges.remove(switched_edge)

        return list(nodes), nodes_data, list(edges)