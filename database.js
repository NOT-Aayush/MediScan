const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

// Use appData directory for packaged app, userData for development
const dbPath = path.join(
  process.env.NODE_ENV === 'development' 
    ? app.getPath('userData') 
    : app.getPath('appData'),
  'MediScan',
  'results.db'
);

// Ensure the directory exists
const fs = require('fs');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

console.log('Database path:', dbPath);

let db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database opening error:', err);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            fat_area REAL,
            muscle_area REAL,
            fat_muscle_ratio REAL,
            fat_min REAL,
            fat_max REAL,
            muscle_min REAL,
            muscle_max REAL,
            images TEXT
        )`);
    }
});

function saveResult(resultData) {
    return new Promise((resolve, reject) => {
        const { name, fat_area, muscle_area, fat_muscle_ratio, fat_min, fat_max, muscle_min, muscle_max, images } = resultData;
        const imagesJson = JSON.stringify(images);
        
        db.run(
            `INSERT INTO results (name, fat_area, muscle_area, fat_muscle_ratio, fat_min, fat_max, muscle_min, muscle_max, images) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, fat_area, muscle_area, fat_muscle_ratio, fat_min, fat_max, muscle_min, muscle_max, imagesJson],
            function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

function getResults() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, name, created_at FROM results ORDER BY created_at DESC", [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function getResultById(id) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM results WHERE id = ?", [id], (err, row) => {
            if (err) return reject(err);
            if (row) {
                row.images = JSON.parse(row.images);
            }
            resolve(row);
        });
    });
}

function deleteResult(id) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM results WHERE id = ?", [id], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function updateResult(id, resultData) {
    return new Promise((resolve, reject) => {
        const { name, fat_area, muscle_area, fat_muscle_ratio, fat_min, fat_max, muscle_min, muscle_max, images } = resultData;
        const imagesJson = JSON.stringify(images);
        
        db.run(
            `UPDATE results SET 
                name = ?,
                fat_area = ?,
                muscle_area = ?,
                fat_muscle_ratio = ?,
                fat_min = ?,
                fat_max = ?,
                muscle_min = ?,
                muscle_max = ?,
                images = ?
             WHERE id = ?`,
            [name, fat_area, muscle_area, fat_muscle_ratio, fat_min, fat_max, muscle_min, muscle_max, imagesJson, id],
            function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}
function updateResultName(id, newName) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE results SET name = ? WHERE id = ?", [newName, id], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}
// Add to exports
module.exports = {
        saveResult,
    getResults,
    getResultById,
    deleteResult,
    updateResult,
    updateResultName
};
