const EPEC_API_BASE_URL = process.env.EPEC_API_BASE_URL;
const EPEC_API_KEY = process.env.EPEC_API_KEY;

if (!EPEC_API_BASE_URL || !EPEC_API_KEY) throw new Error('API_KEY or API_URL not found');

export const getContratos = async (bearerToken: string) => {
    const url = `${EPEC_API_BASE_URL}/usuarios/contratos`;
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            apikey: EPEC_API_KEY
        }
    });

    return response;
}