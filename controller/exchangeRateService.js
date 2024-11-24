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

export async function getExchangeRateCryptomus() {

    const cachedRates = cache.get('exchangeRates');
    if (cachedRates) {
        return cachedRates;
    }
    try {
        const response = await axios.get(`https://api.cryptomus.com/v1/exchange-rate/USD/list`);

        if (!response.data || !response.data.result) {
            throw new Error('Invalid response structure from Cryptomus API');
        }

        const exchangeRates = response.data.result;
        const usdToNgnRate = exchangeRates.find(
            (rate) => rate.from === 'USD' && rate.to === 'NGN'
        );

        if (!usdToNgnRate) {
            throw new Error('USD to NGN rate not found in the API response');
        }


        cache.set('exchangeRateUSD_NGN', usdToNgnRate, 10 * 60 * 1000);

        return usdToNgnRate;

    } catch (error) {
        console.error('Error fetching USD to NGN exchange rate:', error.response?.data || error.message);
        throw new Error('Unable to fetch USD to NGN exchange rate. Please try again later.');
    }
}

export default getExchangeRate;
