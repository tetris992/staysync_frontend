// src/render/scrapers/scrapeHelper.js

import nodeApi from '../src/node/nodeApi.js'; // 메인 프로세스용 api

export async function sendReservations(hotelId, siteName, reservations) {
  try {
    await nodeApi.post('/reservations', { siteName, reservations, hotelId });
    console.log(`Saved reservations for ${hotelId}`);
  } catch (error) {
    console.error('Failed to send reservations:', error);
  }
}
