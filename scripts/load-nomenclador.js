import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Fetch CSV from blob URL
const csvUrl = 'https://blobs.vusercontent.net/blob/Marcas%20en%20Seenka-jajEITX3dUwvIRWceADhhLVkrUsjJY.csv';
console.log('Fetching CSV from URL...');
const response = await fetch(csvUrl);
const csvContent = await response.text();
const lines = csvContent.split('\n').filter(line => line.trim());

console.log(`Header: ${lines[0]}`);
console.log(`Total lines (including header): ${lines.length}`);

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  let entidad, sector, industria;
  if (line.includes('"')) {
    const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (matches && matches.length >= 3) {
      entidad = matches[0].replace(/^"|"$/g, '').trim();
      sector = matches[1].replace(/^"|"$/g, '').trim();
      industria = matches[2].replace(/^"|"$/g, '').trim();
    }
  } else {
    const parts = line.split(',');
    if (parts.length >= 3) {
      entidad = parts[0].trim();
      sector = parts[1].trim();
      industria = parts[2].trim();
    }
  }
  
  if (entidad && sector && industria) {
    rows.push({ entidad, sector, industria });
  }
}

console.log(`Parsed ${rows.length} rows`);

// Clear existing data
const { error: deleteError } = await supabase
  .from('seenka_nomenclador')
  .delete()
  .neq('id', 0);

if (deleteError) {
  console.error(`Error clearing table:`, deleteError.message);
}

// Insert in batches of 500
const BATCH_SIZE = 500;
let inserted = 0;
let errors = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const { error } = await supabase
    .from('seenka_nomenclador')
    .insert(batch);
  
  if (error) {
    console.error(`Error in batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    errors++;
  } else {
    inserted += batch.length;
  }
  
  console.log(`Progress: ${inserted}/${rows.length} inserted`);
}

console.log(`Done! Inserted: ${inserted}, Errors: ${errors}`);

// Verify count
const { count } = await supabase
  .from('seenka_nomenclador')
  .select('*', { count: 'exact', head: true });

console.log(`Total rows in table: ${count}`);

// Show sample
const { data: sample } = await supabase
  .from('seenka_nomenclador')
  .select('entidad, sector, industria')
  .limit(5);

console.log(`Sample:`, JSON.stringify(sample, null, 2));
