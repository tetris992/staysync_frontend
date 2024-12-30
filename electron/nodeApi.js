//src/node/nodeApi.js

import axios from 'axios';
import Store from 'electron-store';

const store = new Store();
const BASE_URL =
  'http://localhost:3003'; // aws 서버주소

const nodeApi = axios.create({ baseURL: BASE_URL });

nodeApi.interceptors.request.use((config) => {
  const token = store.get('accessToken');
  // ↑ 메인 프로세스에서 electron-store 이용
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 혹은 refresh-token 로직 추가 가능

export default nodeApi;
