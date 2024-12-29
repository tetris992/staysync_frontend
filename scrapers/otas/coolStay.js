// src/render/scrapers/coolStay.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js';

// logger 제거, console 사용
// import logger from '../render/utils/logger.js';

const statusMap = {
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Canceled',
  CHECKIN: 'Checked In',
  CHECKOUT: 'Checked Out',
  // 필요한 경우 추가
};

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동하는 헬퍼 함수
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  // 열려있는 탭(페이지) 목록
  const pages = await browser.pages();

  // urlKeyword(예: 'pms.coolstay.co.kr')가 포함된 탭이 있는지 확인
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    // 없다면 새 탭 생성
    targetPage = await browser.newPage();
    console.log(`[CoolStay] Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });
    }
  } else {
    // 이미 열려 있으면 bringToFront()로 활성화
    console.log(`[CoolStay] Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }

  return targetPage;
}

/**
 * CoolStay 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'CoolStay')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeCoolStay = async (hotelId, siteName, browserInstance) => {
  let page;
  let reservationData = null;

  try {
    // 1) 도메인 키워드 및 대시보드 URL 설정
    const urlKeyword = 'pms.coolstay.co.kr';
    const fallbackURL = 'https://pms.coolstay.co.kr/motel-biz-pc/dashboard';
    const today = moment().format('YYYY-MM-DD');

    // 2) 이미 열려 있는 탭을 재활용 or 새 탭 생성
    page = await findOrCreatePage(browserInstance, urlKeyword, fallbackURL);

    // 3) 기본 설정 (User-Agent, Viewport 등)
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 1024 });

    // 4) 응답 가로채기 (예약 데이터 API 응답 intercept)
    page.on('response', async (response) => {
      const url = response.url();
      try {
        if (url.includes('/coolstay/pms/book')) {
          const data = await response.json();
          reservationData = data;
          console.info('Intercepted Reservation Data (POST):', data);
        }
      } catch (error) {
        console.warn(
          `Failed to parse reservation data from: ${url}, attempting raw text.`
        );
        // 필요시 raw text 파싱 시도 가능
      }
    });

    // (선택) 페이지가 이미 열려있고 로그인되어 있을 수 있으니,
    // 다시 대시보드로 이동 (갱신)하고자 하면 아래 코드 유지
    // (이미 fallbackURL 이동했으므로, 한 번 더 이동할지 여부는 상황에 맞춰 결정)
    try {
      await page.goto(fallbackURL, {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });
      console.info(
        `Navigated to dashboard page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      console.error(
        `Error while navigating to the dashboard page for hotelId ${hotelId}:`,
        error.message
      );
      return;
    }

    // 5) 로그인 여부 확인
    const isLoggedIn = await page.evaluate(() => {
      // 로그인 폼의 버튼 존재 여부로 판단 (예시)
      const loginButton = document.querySelector('button[type="submit"]');
      return !loginButton;
    });

    if (!isLoggedIn) {
      console.info('[CoolStay] Not logged in. Proceeding to login...');
      await page.type('input[name="userId"]', process.env.COOLSTAY_USERNAME);
      await page.type(
        'input[name="userPassword"]',
        process.env.COOLSTAY_PASSWORD
      );
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
      ]);
      console.info(
        `[CoolStay] Logged in successfully as ${process.env.COOLSTAY_USERNAME}`
      );
    } else {
      console.info('[CoolStay] Already logged in.');
    }

    // 6) 예약 페이지로 이동
    try {
      await page.goto('https://pms.coolstay.co.kr/motel-biz-pc/reservation', {
        waitUntil: 'networkidle0',
        timeout: 120000,
      });
      console.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      console.error(
        `Error while navigating to the reservation page for hotelId ${hotelId}:`,
        error.message
      );
      return;
    }

    // 7) 데이터 로드 대기 (book API 응답)
    await page.waitForResponse(
      (response) =>
        response.url().includes('/coolstay/pms/book') &&
        response.status() === 200,
      { timeout: 30000 }
    );

    // 8) 예약 데이터 가공
    if (
      !reservationData ||
      !reservationData.orders ||
      reservationData.orders.length === 0
    ) {
      console.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}.`
      );
      return;
    }

    const reservations = reservationData.orders.map((order) => ({
      reservationNo: order.orderKey || 'Unknown',
      customerName: order.book?.user?.name || 'Unknown',
      roomInfo: order.book?.room?.name || 'Unknown Room',
      checkIn: moment(order.book?.startDt).format('YYYY-MM-DD HH:mm'),
      checkOut: moment(order.book?.endDt).format('YYYY-MM-DD HH:mm'),
      reservationDate: moment(order.book?.regDt).format('YYYY-MM-DD HH:mm'),
      reservationStatus: statusMap[order.book?.status] || 'Unknown',
      price: order.totalPrice || order.salesPrice || 0,
      paymentMethod:
        order.payment?.methodDetailKr &&
        order.payment.methodDetailKr !== '결제수단없음'
          ? order.payment.methodDetailKr
          : 'OTA',
      customerPhone: order.book?.safeNumber || '정보 없음',
      siteName,
    }));

    console.info(`[CoolStay] Processed reservations:`, reservations);

    // 9) 예약 데이터 전송
    await sendReservations(hotelId, siteName, reservations);
    console.info(
      `${siteName} reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} (hotelId: ${hotelId}):`,
      error.message
    );
    throw error;
  } finally {
    // 10) 페이지 닫지 않고 유지
    if (page) {
      // await page.close();
      console.info(
        `[CoolStay] Keeping page open: ${siteName}, hotelId: ${hotelId}.`
      );
    }
    // (browser.disconnect()도 ScraperManager에서 일괄 처리)
  }
};

export default scrapeCoolStay;
