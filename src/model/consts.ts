export type AllowedTypes = 'function' | 'class' | 'interface' | 'method' | 'enum' | 'struct' | 'namespace' | 'mod' | 'export' | 'type' | 'assignment' | 'file' | 'folder'; 

export const excludedFolders = ['.git', '.vscode', 'venv', 'node_modules', 'dist', '__pycache__']
export const excludedExtensions = ['min.js', 'min.css', 'min.css.map', 'min.js.map', 'd.ts']

export const languageExtensionMap: Record<string, string> = {
  'py': 'python',
  'ipynb': 'python',
  'js': 'javascript',
  'ts': 'typescript',
  'tsx': 'tsx',
}

export const newClassMethodsMap: Record<string, string> = {
    'python': '__init__',
    'javascript': 'constructor',
    'typescript': 'constructor',
    'tsx': 'constructor',
    'rust': 'new'
}

export const itselfClassMap: Record<string, string> = {
    'python': 'self',
    'javascript': 'this',
    'typescript': 'this',
    'tsx': 'this',
    'rust': 'self'
}

export const indexSuffixesMap: Record<string, string> = {
    'python': '/__init__',
    'javascript': '/index',
    'typescript': '/index',
    'tsx': '/index'
}

export const treeSitterCommentTypes = ['comment', 'line_comment', 'block_comment']