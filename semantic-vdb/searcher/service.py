from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# The file where NeuralSearcher is stored
from neural_searcher import NeuralSearcher

app = FastAPI()
neural_searcher = NeuralSearcher(collection_name="lyrics")
# Define allowed origins
origins = [
    "http://localhost",
    "http://localhost:8000",
]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# simple API endpoint
@app.get("/api/search")
def search(query: str, top_k: int = 20):
    """
    Search for the nearest vectors
    """
    data = neural_searcher.search(query, top_k=top_k)

    return data

# graph api endpoint
@app.get("/api/graph")
def graph(key: int, top_k: int = 20, N: int = 15, treshold: float = 0.1):
    """
    Search for the nearest vectors
    """
    nodes, node_data, edges = neural_searcher.retrieve_graph(
        [key], top_k=top_k, N=N, treshold=treshold
        )
    
    return {
        "nodes": nodes,
        "node_data": node_data,
        "edges": edges
    }

@app.get("/api/health")
def health():
    return {}

# Run the FastAPI app
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=6555)