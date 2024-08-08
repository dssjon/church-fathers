import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.5.0/dist/transformers.min.js';
import { openDB } from 'https://cdn.jsdelivr.net/npm/idb@7/+esm';

const BOOKS = [
  "matthew", "mark", "luke", "john", "acts", "romans", "1corinthians", "2corinthians", "galatians", "ephesians", "philippians", "colossians", "1thessalonians", "2thessalonians", "1timothy", "2timothy", "titus", "philemon", "hebrews", "james", "1peter", "2peter", "1john", "2john", "3john", "jude", "revelation"
];
const FATHERS = [
  "Augustine of Hippo", "Athanasius of Alexandria", "Basil of Caesarea", "Gregory of Nazianzus", "Gregory of Nyssa", "Cyril of Alexandria", "Irenaeus", "Cyprian", "Origen of Alexandria"
];

let commentaryData = {};
let pipe;
let searchResults = [];
let db;

const updateElement = (id, content) => (document.getElementById(id).textContent = content);
const updateStatus = (message) => { updateElement("status", message); console.log(message); };
const updateDebugInfo = (message) => { updateElement("debugInfo", message); console.log(message); };

const createCheckbox = (label, value, checked) => {
  const div = document.createElement("div");
  div.className = "flex items-center mb-1 whitespace-nowrap";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = value;
  checkbox.value = value;
  checkbox.className = "mr-2";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => updateSelectedCount(checkbox.closest(".multi-select").id));
  const labelElement = document.createElement("label");
  labelElement.htmlFor = checkbox.id;
  labelElement.textContent = label;
  labelElement.className = "text-sm";
  div.append(checkbox, labelElement);
  return div;
};

const populateMultiSelect = (elementId, options, defaultChecked = true) => {
    const container = document.getElementById(elementId);
    const optionsDiv = document.createElement("div");
    optionsDiv.className = "hidden mt-2";
    optionsDiv.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs text-gray-500">0 selected</span>
        <button class="text-xs text-blue-500 toggle-all">Toggle All</button>
      </div>
      <div class="max-h-32 overflow-y-auto text-sm"></div>
    `;
    const checkboxesContainer = optionsDiv.querySelector(".max-h-32");
    options.forEach((option) => {
      const isChecked = defaultChecked;
      checkboxesContainer.appendChild(createCheckbox(option, option.replace(/ /g, "_"), isChecked));
    });
    container.innerHTML = `
      <div class="border rounded bg-gray-50 p-2">
        <div class="flex justify-between items-center cursor-pointer">
          <span class="font-bold text-sm">Select ${elementId === "bookMultiSelect" ? "Books" : "Church Fathers"}</span>
          <span class="transform transition-transform duration-200">▼</span>
        </div>
      </div>
    `;
    container.querySelector(".border").appendChild(optionsDiv);
    container.querySelector(".flex").addEventListener("click", () => toggleExpand(optionsDiv));
    container.querySelector(".toggle-all").addEventListener("click", () => toggleAll(optionsDiv));
    updateSelectedCount(elementId);
  };

const toggleExpand = (optionsDiv) => {
  const isHidden = optionsDiv.classList.contains("hidden");
  document.querySelectorAll(".multi-select .hidden").forEach((div) => div.classList.remove("hidden"));
  document.querySelectorAll(".multi-select span:last-child").forEach((span) => (span.style.transform = "rotate(0deg)"));
  if (isHidden) {
    optionsDiv.classList.remove("hidden");
    optionsDiv.previousElementSibling.querySelector("span:last-child").style.transform = "rotate(180deg)";
  }
};

const toggleAll = (optionsDiv) => {
  const checkboxes = optionsDiv.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
  checkboxes.forEach((cb) => (cb.checked = !allChecked));
  updateSelectedCount(optionsDiv.closest(".multi-select").id);
};

const updateSelectedCount = (elementId) => {
  const container = document.getElementById(elementId);
  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  const selectedCount = Array.from(checkboxes).filter((cb) => cb.checked).length;
  container.querySelector(".text-xs.text-gray-500").textContent = `${selectedCount} selected`;
};

const getSelectedItems = (elementId) => Array.from(document.querySelectorAll(`#${elementId} input[type="checkbox"]:checked`)).map((cb) => cb.value);

const isValidEmbedding = (embedding) => Array.isArray(embedding) && embedding.every((num) => typeof num === "number" && !isNaN(num) && isFinite(num));

const processFileData = (fileData, book) => {
  const data = JSON.parse(fileData);
  const entries = Array.isArray(data) ? data : [data];
  entries.forEach((entry) => {
    if (typeof entry.embedding === "object" && !Array.isArray(entry.embedding)) {
      entry.embedding = Object.values(entry.embedding);
    }
    if (isValidEmbedding(entry.embedding)) {
      commentaryData[book].push(entry);
    } else {
      updateDebugInfo(`Invalid embedding in entry of file: ${book}`);
    }
  });
};

const initIndexedDB = async () => {
  db = await openDB('commentaryDB', 1, {
    upgrade(db) {
      db.createObjectStore('commentaryStore');
    },
  });
};

const saveToStorage = async (key, value) => {
  try {
    await db.put('commentaryStore', value, key);
  } catch (error) {
    console.error("Error saving to IndexedDB:", error);
    // If IndexedDB fails, try localStorage as a fallback
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (localStorageError) {
      console.error("Error saving to localStorage:", localStorageError);
      // If both fail, we might need to clear some data
      await clearOldestData();
      // Try saving again after clearing
      await db.put('commentaryStore', value, key);
    }
  }
};

const getFromStorage = async (key) => {
  try {
    const value = await db.get('commentaryStore', key);
    return value;
  } catch (error) {
    console.error("Error retrieving from IndexedDB:", error);
    // If IndexedDB fails, try localStorage as a fallback
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : null;
  }
};

const clearOldestData = async () => {
  const allKeys = await db.getAllKeys('commentaryStore');
  if (allKeys.length > 0) {
    // This is a simple strategy: remove the first key (assumed to be the oldest)
    // You might want to implement a more sophisticated strategy based on your needs
    await db.delete('commentaryStore', allKeys[0]);
  }
};

const loadCommentaryData = async (books) => {
  const selectedFathers = getSelectedItems("fatherMultiSelect");
  for (const book of books) {
    if (!commentaryData[book]) {
      commentaryData[book] = [];
      updateStatus(`Loading ${book} commentary...`);
      for (const father of selectedFathers) {
        let fileIndex = 1;
        let lastLoadedIndex = await getFromStorage(`lastIndex_${book}_${father}`) || 0;
        
        while (true) {
          const zipFileName = `${book}_${father.replace(/ /g, "_")}${fileIndex > 1 ? (fileIndex === 2 ? "_2" : `_${fileIndex}`) : ""}.zip`;
          const storageKey = `commentary_${book}_${father}_${fileIndex}`;
          let fileData = await getFromStorage(storageKey);
          
          if (!fileData && fileIndex > lastLoadedIndex) {
            const zipFilePath = `/commentary_embeddings/${book}/${zipFileName}`;
            try {
              const zipResponse = await fetch(zipFilePath);
              if (!zipResponse.ok) break;
              const blob = await zipResponse.blob();
              const zip = await JSZip.loadAsync(blob);
              await Promise.all(
                Object.keys(zip.files).map(async (filename) => {
                  if (filename.endsWith(".json")) {
                    fileData = await zip.files[filename].async("string");
                    await saveToStorage(storageKey, fileData);
                    processFileData(fileData, book);
                  }
                })
              );
              await saveToStorage(`lastIndex_${book}_${father}`, fileIndex);
            } catch (error) {
              updateDebugInfo(`Error processing ${zipFilePath}: ${error.message}`);
              break;
            }
          } else if (fileData) {
            processFileData(fileData, book);
          } else {
            break;  // No more files to process
          }
          fileIndex++;
        }
      }
      updateDebugInfo(`Loaded ${commentaryData[book].length} entries for ${book}`);
    }
  }
  updateStatus("Commentary data loading complete");
};

const cosineSimilarity = (a, b) => {
  const dotProduct = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
};

const searchCommentary = async (query, selectedBooks) => {
  updateStatus("Searching...");
  try {
    const output = await pipe(query, { pooling: "mean", normalize: true });
    const queryEmbedding = Array.from(output.data);
    let results = [];
    for (const book of selectedBooks) {
      if (!commentaryData[book]) await loadCommentaryData([book]);
      results = results.concat(
        commentaryData[book].map((entry) => ({
          ...entry.metadata,
          content: entry.content,
          similarity: cosineSimilarity(queryEmbedding, entry.embedding),
          book
        })).filter((result) => !isNaN(result.similarity) && isFinite(result.similarity))
      );
    }
    updateStatus("Search complete.");
    return results.sort((a, b) => b.similarity - a.similarity);
  } catch (error) {
    console.error("Error in searchCommentary:", error);
    updateStatus("Error during search. Check console for details.");
    return [];
  }
};

const displayResults = (results) => {
  const resultsDiv = document.getElementById("results");
  const resultInfoDiv = document.getElementById("resultInfo");
  resultsDiv.innerHTML = "";
  if (results.length > 0) {
    resultInfoDiv.textContent = `Showing top ${results.length} most similar commentaries.`;
    resultInfoDiv.style.display = "block";
    results.forEach((result) => {
      const resultDiv = document.createElement("div");
      resultDiv.className = "bg-white p-4 rounded shadow";
      resultDiv.innerHTML = `
        <h2 class="text-lg font-bold">${result.father_name}</h2>
        <p class="text-sm text-gray-600 mb-2">Source: ${result.source_title}, Book: ${result.book.charAt(0).toUpperCase() + result.book.slice(1)}</p>
        <p class="mt-2 text-sm">${result.content}</p>
        <p class="text-xs text-gray-600 mt-2">Similarity: ${result.similarity.toFixed(4)}</p>
      `;
      resultsDiv.appendChild(resultDiv);
    });
  } else {
    resultInfoDiv.textContent = "No results found.";
    resultInfoDiv.style.display = "block";
  }
};

const getSummary = async (query, searchResults) => {
  const enableSummary = document.getElementById("enableSummary").checked;
  if (!enableSummary) {
    return null;
  }

  try {
    const response = await fetch("/api/anthropic-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, searchResults })
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.summary;
  } catch (error) {
    console.error("Error getting summary:", error);
    return null;
  }
};

const displaySummary = (summary) => {
  const summaryDiv = document.getElementById("summary");
  const summaryContent = document.getElementById("summaryContent");
  if (summary) {
    summaryContent.innerHTML = marked.parse(summary, { 
      breaks: true,
      gfm: true
    });
    summaryDiv.classList.remove("hidden");
  } else {
    summaryDiv.classList.add("hidden");
  }
};

const getRandomSearchSuggestion = () => {
  const suggestions = [
    "The nature of Christ", "Relationship between faith and reason", "Teachings on the Eucharist", "Biblical interpretation", "Prayer and spiritual disciplines", "Concept of the Trinity"
  ];
  return suggestions[Math.floor(Math.random() * suggestions.length)];
};

document.addEventListener("DOMContentLoaded", async () => {
  await initIndexedDB();
  document.getElementById("searchInput").placeholder = getRandomSearchSuggestion();
  populateMultiSelect("bookMultiSelect", BOOKS, true);
  populateMultiSelect("fatherMultiSelect", FATHERS, true);

  document.getElementById("searchButton").addEventListener("click", async () => {
    let query = document.getElementById("searchInput").value;

    if (!query.trim()) {
      query = document.getElementById("searchInput").placeholder;
      document.getElementById("searchInput").value = query;
    }
  
    const selectedBooks = getSelectedItems("bookMultiSelect");
    const selectedFathers = getSelectedItems("fatherMultiSelect");
    console.log(`Searching for: "${query}" in books: ${selectedBooks.join(", ")}, fathers: ${selectedFathers.join(", ")}`);
    
    try {
      await loadCommentaryData(selectedBooks);
      searchResults = await searchCommentary(query, selectedBooks);
      console.log(`Found ${searchResults.length} results`);
      
      displayResults(searchResults.slice(0, 4));
  
      const summary = await getSummary(query, searchResults.slice(0, 4));
      displaySummary(summary);
    } catch (error) {
      console.error("Error during search:", error);
      updateStatus("Error during search. Check console for details.");
    }
  });
});

// Initialize the model
(async () => {
  try {
    updateStatus("Initializing model...");
    env.allowLocalModels = false;
    pipe = await pipeline("feature-extraction", "Xenova/bge-large-en-v1.5");
    updateStatus("Model initialized.");
    updateStatus("Initialization complete.");
  } catch (error) {
    console.error("Initialization error:", error);
    updateStatus("Error during initialization. Check console for details.");
  }
})();
