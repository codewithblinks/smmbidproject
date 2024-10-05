import axios from "axios";
import NodeCache from "node-cache";

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY; 
const EXCHANGE_RATE_API_URL = `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`;

const cache = new NodeCache({ stdTTL: 3600 });

async function getExchangeRate() {
    const cachedRates = cache.get('exchangeRates');
    if (cachedRates) {
        return cachedRates;
    }

    try {
        const response = await axios.get(EXCHANGE_RATE_API_URL);
        cache.set('exchangeRates', response.data.conversion_rates);
        return response.data.conversion_rates;
    } catch (error) {
        console.error('Error fetching exchange rates:', error);
        throw new Error('Unable to fetch exchange rates');
    }
}
export default getExchangeRate;
