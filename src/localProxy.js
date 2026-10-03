// A separate loopback origin lets development tests avoid a running desktop app.
export const LOCAL_PROXY_URL = import.meta.env?.VITE_WENDAFLOW_PROXY_URL || 'http://127.0.0.1:4318';
