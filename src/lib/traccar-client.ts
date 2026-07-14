import axios from 'axios';

const TRACCAR_API_URL = process.env.TRACCAR_API_URL || 'https://app.almtrace.com/api';
const TRACCAR_USER = process.env.TRACCAR_USER;
const TRACCAR_PASS = process.env.TRACCAR_PASS;

const authHeader =
  TRACCAR_USER && TRACCAR_PASS
    ? `Basic ${Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64')}`
    : undefined;

export const traccarClient = axios.create({
  baseURL: TRACCAR_API_URL,
  headers: {
    Authorization: authHeader,
  },
});
