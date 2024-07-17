import json
import networkx as nx
import community as community_louvain
import matplotlib.pyplot as plt
import pandas as pd
projectId = "judini-python-main"
folder_path = "../../test_files/"
nodes_path = f"{folder_path}/{projectId}/nodes.json"
links_path = f"{folder_path}/{projectId}/links.json"

def graph_to_csv(name='codebase'):

    nodes = pd.read_json("nodesCommunities.json")
    nodes['full_name'] = nodes['id']
    edges = pd.read_json(links_path)

    nodes.to_csv(f'nodes_{name}.csv', index=False)
    edges.to_csv(f'edges_{name}.csv', index=False)
# Function to read JSON files
def read_json(file_path):
    with open(file_path, 'r') as file:
        return json.load(file)
def save_json(data, file_path):
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=4)
# Function to construct graph from nodes and links
def construct_graph_from_json(nodes, links):
    G = nx.Graph()
    for node in nodes:
        G.add_node(node['id'], **node)
    for link in links:
        G.add_edge(link['source'], link['target'], **link)
    return G

# Read nodes and links from JSON files
nodes = read_json(nodes_path)
links = read_json(links_path)


# Construct the graph
G = construct_graph_from_json(nodes, links)

# Detect communities using Louvain algorithm
partition = community_louvain.best_partition(G)

for node in nodes:
    node['community'] = partition[node['id']]
save_json(nodes,"nodesCommunities.json")
graph_to_csv()
# Draw the graph
pos = nx.spring_layout(G)  # Spring layout for better visualization
cmap = plt.get_cmap('viridis')  # Colormap

# Draw nodes with community colors
"""
for community in set(partition.values()):
    list_nodes = [nodes for nodes in partition.keys() if partition[nodes] == community]
    nx.draw_networkx_nodes(G, pos, list_nodes, node_size=300, node_color=[cmap(community / max(partition.values()))])
"""

# Draw edges
#nx.draw_networkx_edges(G, pos, alpha=0.5)
# Draw labels
#nx.draw_networkx_labels(G, pos)

plt.show()
