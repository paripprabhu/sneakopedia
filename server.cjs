const express = require("express");
const cors = require("cors");
const sneakers = require('./sneakerData.js'); // Your database file
const Fuse = require('fuse.js'); // The fuzzy search brain

const app = express();
app.use(cors());

// Configure the Fuzzy Search logic
const fuseOptions = {
  keys: ['shoeName', 'brand', 'description'], // What to search inside
  includeScore: true,
  threshold: 0.4, // 0.0 = exact match only, 1.0 = match anything. 0.4 handles typos well.
};

const fuse = new Fuse(sneakers, fuseOptions);

app.get("/search", (req, res) => {
  const query = req.query.shoe;

  // If no search term, return everything (or empty array if you prefer)
  if (!query) {
    return res.json(sneakers); 
  }

  // Run the fuzzy search
  const result = fuse.search(query);

  // Fuse returns data in a wrapper: { item: { shoe... }, score: 0.1 }
  // We just want the 'item' (the shoe data)
  const cleanResults = result.map(r => r.item);

  res.json(cleanResults);
});

app.listen(4000, () => {
  console.log("🚀 Smart Search Server running on http://localhost:4000");
});