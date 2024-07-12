import sys
import pandas as pd

def graph_to_csv(name='codebase'):

    nodes = pd.read_json('nodes.json')
    nodes['full_name'] = nodes['id']
    edges = pd.read_json('edges.json')

    nodes.to_csv(f'nodes_{name}.csv', index=False)
    edges.to_csv(f'edges_{name}.csv', index=False)

if __name__ == '__main__':
    if len(sys.argv) > 1:
        name = sys.argv[1]

    graph_to_csv(name)