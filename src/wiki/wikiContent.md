# Codebase Documentation# Judini Python Repository

## Overview
The "Judini Python" repository provides a framework for interacting with a CodeGPT agent. It includes functionalities for setting up the Judini Python package, defining API request URLs, handling streaming and non-streaming responses, and creating a chat interface using Streamlit for interacting with an AI assistant.

## Folder Structure

### `judini-python-main`
The root folder of the repository includes various files for setting up the Judini Python package. It imports the `CodeGPTPlus` class, defines API URLs, handles streaming and non-streaming responses, creates a chat interface using Streamlit, and demonstrates chat interactions with a CodeGPT agent utilizing environment variables and necessary imports.

### `judini-python-main\judini-python-main`
This folder contains essential files that demonstrate chat interactions with a CodeGPT agent. It sets up the Judini Python package, imports the `CodeGPTPlus` class, defines API request URLs, handles streaming and non-streaming responses, and creates a Streamlit-based chat interface for interacting with an AI assistant.

**Relevant Files:**
- **`setup.py`**
  - Sets up the Judini Python package with version 0.1.12.
  - Developed by Judini Inc., provides CodeGPT functionality.
  - Includes package information, dependencies, and metadata for distribution.

- **`streamlit.py`**
  - Creates a chat interface using Streamlit.
  - Allows users to interact with an AI assistant.
  - Features for entering CodeGPT API key, Agent ID, enabling streaming, clearing message history, and displaying chat messages.

### `judini-python-main\judini-python-main\examples`
The "examples" folder includes a script showcasing a chat interaction with a CodeGPT agent. 

**Relevant Files:**
- **`chat_completion.py`**
  - Demonstrates a chat interaction with a CodeGPT agent.
  - Utilizes inputs, environment variables for credentials.
  - Imports `os`, `judini`, and `dotenv`.
  - Creates an instance of CodeGPTPlus class.
  - Interacts with the agent for responses and prints them.

### `judini-python-main\judini-python-main\src`
The "src" folder contains the core functionalities of the Judini package.

#### `judini-python-main\judini-python-main\src\judini`
This folder includes files essential for defining the CodeGPTPlus class, handling JSON serialization, and managing streaming and non-streaming responses using the `requests` library.

**Relevant Files:**
- **`__init__.py`**
  - Serves as the package's initialization file.
  - Contains import statement for the `CodeGPTPlus` class from the `codegpt` module.

- **`codegpt.py`**
  - Defines the `CodeGPTPlus` class.
  - Contains base URL for API requests (`https://api-beta.codegpt.co/api/v1`).
  - Stores the constant PLAYGROUND_KEYS_URL (`https://app.codegpt.co/en/apikeys`).

- **`types.py`**
  - Defines several classes (Agent, DocumentMetadata, Document).
  - Manages attributes and functionalities for storing information.
  - Facilitates JSON serialization and validation.

- **`utils.py`**
  - Contains two main functions:
    - **`handle_stream`**: Handles a streaming response using the `requests` library.
    - **`handle_non_stream`**: Extracts and returns JSON content from a `requests.Response` object, handling exceptions and closing the response.

## Contributing
Contributions to the Judini Python repository are welcome. Please ensure all pull requests adhere to any outlined contribution guidelines and verify code functionality.

## License
This repository is licensed under the relevant terms as specified by Judini Inc. (details typically included in a `LICENSE` file in the repository).

## Acknowledgements
Developed by Judini Inc., utilizing `CodeGPT` capabilities for enhancing interactive AI functionalities within the Python ecosystem.