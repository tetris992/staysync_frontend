// backend/scrapers/booking.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
// logger 제거하고 console 사용

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동하는 헬퍼 함수
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  const pages = await browser.pages();
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    targetPage = await browser.newPage();
    console.log(`[Booking] Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    }
  } else {
    console.log(`[Booking] Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }

  return targetPage;
}

/**
 * Booking.com 스크래퍼 함수
 * @param {String} hotelId - (우리 시스템에서 관리하는) 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'Booking.com')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeBooking = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 1) 30일 범위 설정
    const startDate = moment().format('YYYY-MM-DD');
    const endDate = moment().add(30, 'days').format('YYYY-MM-DD');

    // 2) 초기 fallbackURL에 임시 hotel_id(예: 6876426)와 30일 날짜 범위 적용
    const urlKeyword = 'admin.booking.com/'; // 찾을 키워드
    const fallbackHotelId = '6876426'; // 임시로 넣어두는 값
    const fallbackURL =
      `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html` +
      `?upcoming_reservations=1&source=nav` +
      `&hotel_id=${fallbackHotelId}` +
      `&lang=ko` +
      `&date_from=${startDate}` +
      `&date_to=${endDate}` +
      `&date_type=arrival`;

    // 3) 이미 열려 있는 탭(없으면 새 탭)에 fallbackURL 로딩
    page = await findOrCreatePage(browserInstance, urlKeyword, fallbackURL);

    // 4) 페이지 기본 설정 (User-Agent, Viewport 등)
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 1024 });

    console.info(
      `[Booking] Loaded fallback URL for date range ${startDate} ~ ${endDate}.`
    );

    // 5) 실제로 이동한 URL에서 hotel_id를 추출
    const currentUrl = page.url();
    const urlObj = new URL(currentUrl);
    const realHotelId = urlObj.searchParams.get('hotel_id') || 'unknown';
    console.log(
      `[Booking] Detected bookingHotelId from address: ${realHotelId}`
    );

    // 6) 추출한 hotel_id로 "최종" 예약 페이지 주소 구성
    const finalBookingURL =
      `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/search_reservations.html` +
      `?upcoming_reservations=1&source=nav` +
      `&hotel_id=${realHotelId}` +
      `&lang=ko` +
      `&date_from=${startDate}` +
      `&date_to=${endDate}` +
      `&date_type=arrival`;

    console.info(
      `[Booking] Navigating to final booking URL: ${finalBookingURL}`
    );

    // 7) 최종 예약 페이지로 이동
    await page.goto(finalBookingURL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // ─────────────────────────────────────────────
    //  (중요) 10초간 대기 (page.waitForTimeout 사용 불가 시)
    // ─────────────────────────────────────────────
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // 또는 특정 셀렉터를 기다리는 방법:
    // await page.waitForSelector('.reservation-table__wrapper table tbody tr', { timeout: 15000 });

    // 8) 예약 정보 추출
    const reservations = await page.$$eval(
      '#main-content > div > div.reservation-table__wrapper > table > tbody > tr',
      (rows) =>
        rows
          .map((row) => {
            const customerNameElement = row.querySelector('th');
            if (!customerNameElement) return null;

            const customerName = customerNameElement.innerText.trim();
            const checkIn =
              row.querySelector('td:nth-child(2)')?.innerText.trim() || '';
            const checkOut =
              row.querySelector('td:nth-child(3)')?.innerText.trim() || '';
            const roomInfo =
              row
                .querySelector('td.wrap-anywhere.bui-table__cell')
                ?.innerText.trim() || '';
            const reservationDate =
              row.querySelector('td:nth-child(5)')?.innerText.trim() || '';
            const reservationStatus =
              row.querySelector('td:nth-child(6)')?.innerText.trim() || '';
            const price =
              row.querySelector('td:nth-child(7)')?.innerText.trim() || '';
            const reservationNo =
              row.querySelector('td:nth-child(9)')?.innerText.trim() || '';

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
          .filter((r) => r !== null)
    );

    console.info(
      `[Booking] Extracted Reservation Data (hotelId: ${hotelId}):`,
      reservations
    );

    if (!reservations || reservations.length === 0) {
      console.info(
        `[Booking] No reservations found for ${siteName}, hotelId: ${hotelId}.`
      );
      return;
    }

    // 9) 서버로 전송
    await sendReservations(hotelId, siteName, reservations);
    console.info(
      `[Booking] Reservations successfully saved (hotelId: ${hotelId}).`
    );
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} (hotelId: ${hotelId}):`,
      error.message
    );
    throw error;
  } finally {
    // 10) 페이지 닫지 않고 유지 (로그인 세션/탭 재활용)
    if (page) {
      // await page.close();
      console.info(
        `[Booking] Keeping page open for ${siteName}, hotelId: ${hotelId}.`
      );
    }
  }
};

export default scrapeBooking;
