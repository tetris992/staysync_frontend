// backend/scrapers/expedia.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
// logger 제거 후 console 사용

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동하는 헬퍼 함수
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  // 열려있는 탭(페이지) 목록
  const pages = await browser.pages();

  // urlKeyword(예: 'apps.expediapartnercentral.com')가 포함된 탭이 있는지 확인
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    // 없다면 새 탭 생성
    targetPage = await browser.newPage();
    console.log(`[Expedia] Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    }
  } else {
    // 이미 열려 있으면 bringToFront()로 활성화
    console.log(`[Expedia] Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }

  return targetPage;
}

/**
 * Expedia 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'Expedia')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeExpedia = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 1) 도메인 키워드 및 예약 페이지(예시) 설정
    const urlKeyword = 'apps.expediapartnercentral.com';
    const fallbackURL = 'https://apps.expediapartnercentral.com/lodging/bookings?htid=21495841';
    const today = moment().format('YYYY-MM-DD');
    
    // 2) 이미 열려 있는 탭이 있는지 확인 or 새 탭 생성
    page = await findOrCreatePage(browserInstance, urlKeyword, fallbackURL);

    // 3) 기본 설정 (User-Agent, Viewport 등)
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 1024 });

    // (선택) 날짜 파라미터가 필요한 경우, 여기서 URL 재구성 후 goto
    // 하지만 예시 코드에서는 고정된 booking URL을 사용.
    console.info(`[Expedia] Navigating to reservation page for hotelId: ${hotelId}`);
    try {
      // 다시 goto (원하는 날짜 파라미터가 있다면 수정 가능)
      await page.goto(fallbackURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      console.info(
        `Navigated to reservation page: ${siteName}, hotelId: ${hotelId}`
      );
    } catch (error) {
      console.error('Failed to navigate to the reservation page:', error.message);
      throw new Error('Failed to navigate to Expedia reservation page');
    }

    // 4) 예약 정보 추출
    const reservations = await page.$$eval('table > tbody > tr', (rows) =>
      rows
        .map((row) => {
          const reservationNoCell = row.querySelector('td.reservationId');
          if (!reservationNoCell) return null;

          let reservationNo = reservationNoCell.innerText.trim();
          let reservationStatus =
            row.querySelector('td.confirmationCode')?.innerText.trim() || '';
          const customerName =
            row.querySelector('td.guestName')?.innerText.trim() || '';
          const roomInfo =
            row.querySelector('td.roomType')?.innerText.trim() || '';
          const checkIn =
            row.querySelector('td.checkInDate')?.innerText.trim() || '';
          const checkOut =
            row.querySelector('td.checkOutDate')?.innerText.trim() || '';
          const price =
            row.querySelector('td.bookingAmount')?.innerText.trim() || '';
          const reservationDate =
            row.querySelector('td.bookedOnDate')?.innerText.trim() || '';

          // 취소된 예약 처리
          if (reservationNo.includes('Canceled')) {
            reservationNo = reservationNo.replace('Canceled', '').trim();
            reservationStatus = 'Canceled';
          }

          return {
            reservationStatus,
            reservationNo,
            customerName,
            roomInfo,
            checkIn,
            checkOut,
            price,
            reservationDate,
          };
        })
        .filter((res) => res !== null)
    );

    console.info('[Expedia] Extracted Reservation Data:', reservations);

    // 5) 예약이 없는 경우 종료
    if (!reservations || reservations.length === 0) {
      console.info(
        `No reservations found for ${siteName} (hotelId: ${hotelId}). Data will not be sent.`
      );
      return;
    }

    // 6) 예약 데이터 서버 전송
    await sendReservations(hotelId, siteName, reservations);
    console.info(
      `[Expedia] Reservations successfully saved (hotelId: ${hotelId}).`
    );
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} (hotelId: ${hotelId}):`,
      error.message
    );
    throw error; // 상위(큐 매니저 등)에서 재시도 가능
  } finally {
    // 7) 페이지 닫지 않고 유지 (로그인 세션/탭 재활용)
    if (page) {
      // await page.close();
      console.info(`[Expedia] Keeping page open for ${siteName}, hotelId: ${hotelId}.`);
    }
    // (browser.disconnect()도 ScraperManager에서 일괄 처리)
  }
};

export default scrapeExpedia;
