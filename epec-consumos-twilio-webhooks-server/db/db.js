import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in the environment variables.');
}

export const pool = new Pool({
    connectionString,
});

export const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`Executed query: { text: ${text}, duration: ${duration}ms, rows: ${res.rowCount} }`);
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};