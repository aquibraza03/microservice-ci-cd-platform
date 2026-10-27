#!/usr/bin/env node
const fs = require("fs");
const { generateDataset } = require("./dataset");
const options = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
  : {};
process.stdout.write(`${JSON.stringify(generateDataset(options), null, 2)}\n`);
