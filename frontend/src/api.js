import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
});

export const getApplications = (status) => {
  return api.get('/applications', { params: { status } });
};

export const getApplication = (id) => {
  return api.get(`/applications/${id}`);
};

export const createApplication = (data) => {
  return api.post('/applications', data);
};

export const communityReview = (id, data) => {
  return api.post(`/applications/${id}/community-review`, data);
};

export const streetReview = (id, data) => {
  return api.post(`/applications/${id}/street-review`, data);
};

export const createPaymentBatch = () => {
  return api.post('/payments/batches');
};

export const getPaymentBatches = () => {
  return api.get('/payments/batches');
};

export const confirmPaymentBatch = (id) => {
  return api.post(`/payments/batches/${id}/confirm`);
};

export default api;
