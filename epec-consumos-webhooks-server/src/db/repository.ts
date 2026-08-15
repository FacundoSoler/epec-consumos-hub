import { pool } from './db.js';
import { encrypt } from './encryption.js';

export async function deleteUserAndCleanupContracts(documento: number, emailAddress: string, sub: number) {
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

export async function syncUserContext(notificiationsPreferences: any) {
    const { documento, emailAddress, fullName, token, contratos, notificationsPreferences } = notificiationsPreferences;

    const emailEnabled = notificationsPreferences?.email_reports?.enabled === true;
    const whatsappEnabled = notificationsPreferences?.email_alerts?.enabled === true;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Notifications disabled for user - remove notifications guard clause + leave early
        if (!emailEnabled && !whatsappEnabled) {
            await client.query(`
                DELETE FROM users 
                WHERE documento = $1;
            `, [documento]);

            await client.query('COMMIT');
            return { success: true, synced: false };
        }

        // Notifications enabled for user
        const userCheck = await client.query(`
            SELECT id FROM users WHERE documento = $1;
        `, [documento]);

        if (userCheck.rows.length > 0) {
            const userId = userCheck.rows[0].id;

            await client.query(`
                INSERT INTO user_preferences (user_id, preferences)
                VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET 
                    preferences = EXCLUDED.preferences,
                    updated_at = CURRENT_TIMESTAMP;
            `, [userId, JSON.stringify(notificationsPreferences)]);

            await client.query('COMMIT');
            return { success: true, synced: true, userId, optimized: true };
        }

        /* 
           ARCHITECTURAL INTENT: Nullify contact paths if their specific 
           notification vector is disabled to maintain data minimization.
        */
        const targetEmail = emailEnabled ? emailAddress.toLowerCase().trim() : null;
        const targetPhoneNumber = whatsappEnabled ? notificiationsPreferences.phoneNumber : null;

        const userRes = await client.query(`
            INSERT INTO users (documento, email_address, phone_number, app_user_name, token)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (documento) DO UPDATE SET 
                email_address = EXCLUDED.email_address,
                phone_number = EXCLUDED.phone_number,
                token = EXCLUDED.token,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id;
        `, [documento, targetEmail, targetPhoneNumber, fullName, encrypt(token)]);

        const userId = userRes.rows[0].id;

        await client.query(`
            INSERT INTO user_preferences (user_id, preferences)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET 
                preferences = EXCLUDED.preferences,
                updated_at = CURRENT_TIMESTAMP;
        `, [userId, JSON.stringify(notificationsPreferences)]);

        if (contratos && Array.isArray(contratos)) {
            await syncUserContracts(client, userId, contratos);
        }

        await client.query('COMMIT');
        return { success: true, synced: true, userId };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction failed, rolled back:', error);
        throw error;
    } finally {
        client.release();
    }
}

export async function syncUserContracts(client: any, userId: any, contratos: any) {
    for (const contrato of contratos) {
        await client.query(`
            INSERT INTO contracts (contract_id, client_number, owner_name, address)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (contract_id) DO UPDATE SET
                owner_name = EXCLUDED.owner_name,
                address = EXCLUDED.address,
                updated_at = CURRENT_TIMESTAMP;
        `, [contrato.id, contrato.nroCliente, contrato.razonSocial, contrato.direccion]);

        await client.query(`
            INSERT INTO user_contracts (user_id, contract_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, contract_id) DO NOTHING;
        `, [userId, contrato.id]);
    }
}

export async function getNotificationsPreferences() {
    const client = await pool.connect();
    const notificationsUsers = await client.query(`
            SELECT u.email_address, u.phone_number, u.app_user_name, u.token, uc.contract_id, up.preferences
            FROM users u
            JOIN user_preferences up ON up.user_id = u.id
            JOIN user_contracts uc ON uc.user_id = u.id
            WHERE (up.preferences::jsonb -> 'email_reports' -> 'days') @> jsonb_build_array(extract(isodow from current_date)::integer)
            AND (up.preferences::jsonb -> 'email_reports' ->> 'enabled')::boolean = true;
        `);
    return notificationsUsers;
}