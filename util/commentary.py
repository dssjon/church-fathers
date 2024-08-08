import sqlite3
import argparse
import json
import os
import sys
from datetime import datetime
from tqdm import tqdm
from langchain.schema import Document
from langchain.embeddings import HuggingFaceInstructEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
from langchain.embeddings import HuggingFaceInstructEmbeddings, HuggingFaceBgeEmbeddings

# Original SQL data sources: https://github.com/HistoricalChristianFaith/Commentaries-Database

def sanitize_filename(filename):
    # Remove or replace characters that are invalid in filenames
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        filename = filename.replace(char, '_')
    return filename.lower()  # Convert to lowercase for consistency

def save_embeddings_to_json(documents, embeddings, output_dir):
    for doc, embedding in zip(documents, embeddings):
        book = sanitize_filename(doc.metadata.get('book', 'unknown'))
        father_name = doc.metadata.get('father_name', 'unknown')
        
        # Create book subfolder
        book_dir = os.path.join(output_dir, book)
        os.makedirs(book_dir, exist_ok=True)
        
        # Generate base filename
        base_filename = f"{book}_{father_name}"
        base_filename = base_filename.replace(' ', '_')  # Replace spaces with underscores
        
        # Check for existing files and add index if necessary
        index = 1
        while True:
            if index == 1:
                filename = f"{base_filename}.json"
            else:
                filename = f"{base_filename}_{index}.json"
            
            full_path = os.path.join(book_dir, filename)
            if not os.path.exists(full_path):
                break
            index += 1
        
        data = {
            "content": doc.page_content,
            "metadata": doc.metadata,
            "embedding": embedding
        }
        
        with open(full_path, 'w') as f:
            json.dump(data, f)
def load_embeddings_from_json(input_dir):
    documents = []
    embeddings = []
    for root, dirs, files in os.walk(input_dir):
        for filename in files:
            if filename.endswith('.json'):
                with open(os.path.join(root, filename), 'r') as f:
                    data = json.load(f)
                    doc = Document(page_content=data['content'], metadata=data['metadata'])
                    documents.append(doc)
                    embeddings.append(data['embedding'])
    return documents, embeddings

def process_in_batches(documents, embedding_function, batch_size=32):
    all_embeddings = []
    for i in tqdm(range(0, len(documents), batch_size), desc="Generating embeddings"):
        batch = documents[i:i+batch_size]
        try:
            batch_embeddings = embedding_function.embed_documents([doc.page_content for doc in batch])
            all_embeddings.extend(batch_embeddings)
        except Exception as e:
            print(f"Error processing batch {i//batch_size}: {str(e)}")
    return all_embeddings

# Parse the command-line arguments
parser = argparse.ArgumentParser()
parser.add_argument("-db", "--db_file", default="./data.sqlite", help="path to SQLite database file")
parser.add_argument("-m", "--model_name", default="BAAI/bge-large-en-v1.5", help="name of the HuggingFace model to use")
parser.add_argument("-o", "--output_dir", default="./commentary_embeddings", help="path to output directory")
args = parser.parse_args()

# Update variables with user input
db_file = args.db_file
model_name = args.model_name
output_dir = args.output_dir

# subset of the authors in the DB
top_authors = [
    "Augustine of Hippo",
    "Athanasius of Alexandria",
    "Basil of Caesarea",
    "Gregory of Nazianzus",
    "Gregory of Nyssa",
    "Cyril of Alexandria",
    "Irenaeus",
    "Cyprian",
    "Origen of Alexandria"
]

new_testament_books = [
    'matthew', 'mark', 'luke', 'john', 'acts', 'romans', '1corinthians', '2corinthians',
    'galatians', 'ephesians', 'philippians', 'colossians', '1thessalonians', '2thessalonians',
    '1timothy', '2timothy', 'titus', 'philemon', 'hebrews', 'james', '1peter',
    '2peter', '1john', '2john', '3john', 'jude', 'revelation'
]

# Connect to SQLite database and handle potential errors
try:
    connection = sqlite3.connect(db_file)
    cursor = connection.cursor()

    query = "SELECT id, father_name, file_name, append_to_author_name, ts, book, location_start, location_end, txt, source_url, source_title FROM commentary"
    query = query + " WHERE father_name IN ('" + "','".join(top_authors) + "')"
    query += " AND book IN ('" + "','".join(new_testament_books) + "')"
    # filter out where append_to_author_name includes "quoted by Aquinas"
    query += " AND append_to_author_name NOT LIKE '%quoted by Aquinas%'"

    print("running query", query)
    cursor.execute(query)
    rows = cursor.fetchall()
    
except sqlite3.Error as error:
    print("Error while connecting to sqlite", error)
    sys.exit(1)

# Create documents
documents = []
for row in rows:
    id, father_name, file_name, append_to_author_name, ts, book, location_start, location_end, txt, source_url, source_title = row

    # skipping smaller commentaries
    if len(txt) < 1000:
        continue
    
    if source_title == None or source_title == "":
        continue

    doc = Document(page_content=txt)
    doc.metadata = {
        "id": id,
        "father_name": father_name,
        "book": book,
        "location_start": location_start,
        "location_end": location_end,
        "source_url": source_url,
        "source_title": source_title,
        "append_to_author_name": append_to_author_name,
    }
    
    documents.append(doc)

# Close the database connection
cursor.close()
connection.close()

#Split into chunks
chunk_size = 1500
chunk_overlap = 100
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=chunk_size,
    chunk_overlap=chunk_overlap,
)

split_documents = text_splitter.split_documents(documents)
print(f' {len(split_documents)} documents created from {len(documents)} entries')

query_instruction = "Represent the Religious Bible verse commentary text for semantic search:"

# Load embeddings
print(f"Loading embeddings from model {model_name}...")
embedding_function = HuggingFaceBgeEmbeddings(
    model_name=model_name,
    query_instruction=query_instruction,
    encode_kwargs={'normalize_embeddings': True},
    model_kwargs={"device": "mps"}
)

# Generate embeddings
print(f"Generating embeddings (please be patient, this will take a while)...")
embeddings = process_in_batches(split_documents, embedding_function)

# Save embeddings to JSON files
print(f"Saving embeddings to JSON files in {output_dir}...")
save_embeddings_to_json(split_documents, embeddings, output_dir)

then = datetime.now()
completed_at = datetime.now()
elapsed_time_s = (completed_at - then).total_seconds()

print(f"Completed in {elapsed_time_s} seconds")
