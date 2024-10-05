// db/index.js
import pg from 'pg';
import config from './config.js';

const db = new pg.Pool(config);

export default db;
