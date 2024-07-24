import json
import networkx as nx
import pandas as pd
import matplotlib.pyplot as plt
projectId = "api-vicuna-deno-main"
folder_path = "../../test_files/"
nodes_path = f"{folder_path}/{projectId}/nodes.json"
links_path = f"{folder_path}/{projectId}/links.json"

# Function to read JSON files
def read_json(file_path):
    with open(file_path, 'r',encoding="utf8") as file:
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

G = construct_graph_from_json(nodes, links)
# Calculate centralities
degree_centrality = nx.degree_centrality(G)
betweenness_centrality = nx.betweenness_centrality(G)
closeness_centrality = nx.closeness_centrality(G)
pagerank = nx.pagerank(G)
hits = nx.hits(G)
eigenvector_centrality = nx.eigenvector_centrality(G)

# Print or use the centrality measures
#print('Degree Centrality:', degree_centrality)
#print('Betweenness Centrality:', betweenness_centrality)
#print('Closeness Centrality:', closeness_centrality)
#print('PageRank:', pagerank)
#print('Hubs:', hits[0])
#print('Authorities:', hits[1])
#print('Eigenvector Centrality:', eigenvector_centrality)



df = pd.DataFrame({
    'degree': pd.Series(degree_centrality),
    'betweenness': pd.Series(betweenness_centrality),
    'closeness': pd.Series(closeness_centrality),
    'pagerank': pd.Series(pagerank),
    'hubs': pd.Series(hits[0]),
    'authorities': pd.Series(hits[1]),
    'eigenvector': pd.Series(eigenvector_centrality),
    "Node": degree_centrality.keys()
})
#Separate files and nodes
df.set_index('Node', inplace=True)
df.to_csv(f'{projectId}-centrality.csv')
df_files = df[~df.index.str.contains(':')]
df_nodes = df[df.index.str.contains(':')]

# Normalize the centrality measures
df_files = (df_files - df_files.min()) / (df_files.max() - df_files.min())
df_nodes = (df_nodes - df_nodes.min()) / (df_nodes.max() - df_nodes.min())

# Sum the normalized centrality measures
df_files['combined_score'] = df_files.sum(axis=1)
df_nodes["combined_score"] = df_nodes.sum(axis=1)


most_important_nodes = df_nodes.sort_values(by='combined_score', ascending=False)
most_important_files = df_files.sort_values(by='combined_score', ascending=False)
#print('Most Important Nodes:', most_important_nodes)

most_important_nodes.to_csv(f'{projectId}-important-nodes.csv')
most_important_files.to_csv(f'{projectId}-important-files.csv')

# Convert to DataFrame for easier handling
df2 = pd.DataFrame(list(eigenvector_centrality.items()), columns=['Node', 'Eigenvector Centrality'])
df2_nodes = df2[df2['Node'].str.contains(':')]
df2_files = df2[~df2['Node'].str.contains(':')]

# Sort by eigenvector centrality and get top 20 nodes
top_20_nodes = df2_nodes.sort_values(by='Eigenvector Centrality', ascending=False).head(20)
top_20_files = df2_files.sort_values(by='Eigenvector Centrality', ascending=False).head(20)

# Plotting the top 20 nodes and files using matplotlib with subplots
fig, axes = plt.subplots(nrows=1, ncols=2, figsize=(20, 12))  # Adjust the figsize as needed

# Plotting top 20 nodes
axes[0].barh(top_20_nodes['Node'], top_20_nodes['Eigenvector Centrality'], color='skyblue')
axes[0].set_xlabel('Eigenvector Centrality')
axes[0].set_title('Top 20 Nodes by Eigenvector Centrality')
axes[0].invert_yaxis()  # To display the highest centrality at the top

# Plotting top 20 files
axes[1].barh(top_20_files['Node'], top_20_files['Eigenvector Centrality'], color='lightgreen')
axes[1].set_xlabel('Eigenvector Centrality')
axes[1].set_title('Top 20 Files by Eigenvector Centrality')
axes[1].invert_yaxis()  # To display the highest centrality at the top

fig.tight_layout()
plt.show()