import { pool } from './db.js';

export async function deleteUserAndCleanupContracts(documento, emailAddress, sub) {
    const client = await pool.connect();
    const targetEmail = emailAddress.toLowerCase().trim();

    try {
        await client.query('BEGIN');

        // 1. Verify the DNI + email + sub combination in our DB.
        const userCheck = await client.query(`
            SELECT id FROM users 
            WHERE documento = $1 AND LOWER(email_address) = LOWER($2)
            AND sub = $3;
        `, [documento, targetEmail, sub]);

        if (userCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: true, message: 'Usuario no encontrado o los datos no coinciden.' };
        }

        const userId = userCheck.rows[0].id;
        const contractsRes = await client.query(`
            SELECT contract_id FROM user_contracts WHERE user_id = $1;
        `, [userId]);

        // The 'ON DELETE CASCADE' constraint will cleanup user_preferences and user_contracts automatically
        await client.query(`
            DELETE FROM users WHERE id = $1;
        `, [userId]);

        // Clean orphan Contracts w/ subquery
        if (contractsRes.rows.length > 0) {
            for (const row of contractsRes.rows) {
                await client.query(`
                    DELETE FROM contracts
                    WHERE contract_id = $1
                      AND NOT EXISTS (
                          SELECT 1 
                          FROM user_contracts 
                          WHERE contract_id = $1
                      );
                `, [row.contract_id]);
            }
        }

        await client.query('COMMIT');
        return { success: true };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en la transacción de borrado de usuario:', error);
        throw error;
    } finally {
        client.release();
    }
}