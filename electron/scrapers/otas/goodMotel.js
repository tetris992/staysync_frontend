// src/render/scrapers/goodMotel.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동하는 헬퍼 함수
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  // 열려 있는 탭 목록
  const pages = await browser.pages();

  // urlKeyword(예: 'ad.goodchoice.kr')를 포함하는 탭이 있는지 확인
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    // 탭이 없다면 새로 생성
    targetPage = await browser.newPage();
    console.log(`Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    }
  } else {
    // 이미 열려 있다면 bringToFront()로 활성화
    console.log(`Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }
  return targetPage;
}

/**
 * GoodChoice Motel 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'GoodMotel')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeGoodChoiceMotel = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 1) 날짜 계산
    const today = moment();
    const thirtyDaysLater = moment().add(30, 'days');
    const startDate = today.format('YYYY-MM-DD');
    const endDate = thirtyDaysLater.format('YYYY-MM-DD');

    console.info(
      `Scraping reservations for ${siteName}, hotelId: ${hotelId}`
    );
    console.info(`Scraping reservations from ${startDate} to ${endDate}`);

    // 2) "ad.goodchoice.kr" 탭을 찾고, 없으면 새 탭 + initialURL로 이동
    const initialURL = `https://ad.goodchoice.kr/reservation/history/total?start_date=${startDate}&end_date=${startDate}&keyword=&keywordType=ORDER_NUMBER&armgno=&sort=checkin&page=1&checked_in=&status=`;
    page = await findOrCreatePage(
      browserInstance,
      'ad.goodchoice.kr',
      initialURL
    );

    // (추가) StealthPlugin과 관련된 일부 옵션은 puppeteer-extra.use(...)에서 처리
    // 여기서는 userAgent/viewport 등만 설정
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 3) 초기 페이지에서 테이블이 보이는지 확인
    try {
      await page.waitForSelector('table > tbody > tr', { timeout: 60000 });
      console.info('Initial reservation table loaded.');
    } catch (error) {
      console.error(`Initial reservation table not loaded: ${error.message}`);
      // 탭 유지를 원한다면 page.close() 주석 처리
      // await page.close();
      return;
    }

    // 4) updatedURL 로 이동
    const updatedURL = `https://ad.goodchoice.kr/reservation/history/total?start_date=${startDate}&end_date=${endDate}&keyword=&keywordType=ORDER_NUMBER&armgno=&sort=checkin&page=1&checked_in=&status=6`;
    try {
      await page.goto(updatedURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
      console.info(
        `Navigated to updated reservation page with new date range.`
      );
      console.info(`Updated URL: ${page.url()}`);
    } catch (error) {
      console.error(
        `Error navigating to updated reservation page for hotelId ${hotelId}: ${error.message}`
      );
      // await page.close();
      throw new Error(
        'Failed to navigate to updated GoodChoice Motel reservation page'
      );
    }

    // 5) 업데이트된 예약 테이블 로드 확인
    try {
      await page.waitForSelector('table > tbody > tr', { timeout: 60000 });
      console.info('Updated reservation table loaded.');
    } catch (error) {
      console.error(`Updated reservation table not loaded: ${error.message}`);
      // await page.close();
      return;
    }

    // 6) 예약 정보 추출
    const reservations = await page.$$eval('table > tbody > tr', (rows) =>
      rows.map((row) => {
        const reservationStatusCell = row.querySelector('td.is-left.is-first');
        const reservationStatus = reservationStatusCell
          ? reservationStatusCell.innerText.trim()
          : '';

        const roomInfoCell = row.querySelector('td.is-left.detail-info');
        const roomInfoText = roomInfoCell
          ? roomInfoCell.innerText.trim()
          : '';
        const [customerName, phoneNumberRaw] = roomInfoText
          ? roomInfoText.split('|').map((text) => text.trim())
          : ['', ''];

        const phoneNumber = phoneNumberRaw
          ? phoneNumberRaw.split('\n')[0].trim()
          : '';

        // 예약 번호 추출 수정 (가능한 셀 선택자 확인)
        const reservationNoElement = row.querySelector(
          '#app > div.contents-wrapper.container > div.row > div > div > div.contents-component > div.common-component--table.is-type01 > table > tbody > tr > td:nth-child(2) > p'
        );
        const reservationNo = reservationNoElement
          ? reservationNoElement.innerText.trim()
          : '';

        const checkInOutMatch = roomInfoText
          ? roomInfoText.match(
              /\d{4}-\d{2}-\d{2} \d{2}:\d{2} ~ \d{4}-\d{2}-\d{2} \d{2}:\d{2}/
            )
          : null;
        const checkIn = checkInOutMatch
          ? checkInOutMatch[0].split('~')[0].trim()
          : '';
        const checkOut = checkInOutMatch
          ? checkInOutMatch[0].split('~')[1].trim()
          : '';

        const priceCell = row.querySelector(
          'td:nth-child(6) > ul > li:nth-child(1)'
        );
        const price = priceCell ? priceCell.innerText.trim() : '';

        const reservationDate = checkIn;

        return {
          reservationStatus,
          reservationNo,
          customerName,
          phoneNumber,
          roomInfo: roomInfoText.split('-')[1]?.trim() || roomInfoText,
          checkIn,
          checkOut,
          price,
          reservationDate,
        };
      })
    );

    console.info(
      `Extracted Reservation Data: ${JSON.stringify(reservations, null, 2)}`
    );

    // 7) 중복 제거
    const uniqueReservations = Array.from(
      new Map(reservations.map((res) => [res.reservationNo, res])).values()
    );
    console.info(
      `Total unique reservations extracted: ${uniqueReservations.length}`
    );

    // 8) 날짜 유효성 체크
    const isDataValid = uniqueReservations.every((res) => {
      const checkInDate = moment(res.checkIn, 'YYYY-MM-DD HH:mm');
      const start = moment(startDate, 'YYYY-MM-DD');
      const end = moment(endDate, 'YYYY-MM-DD').endOf('day');
      return checkInDate.isBetween(start, end, null, '[]');
    });
    console.info(`All reservations within date range: ${isDataValid}`);

    if (!isDataValid) {
      console.warn('Some reservations fall outside the date range.');
    }

    if (!uniqueReservations || uniqueReservations.length === 0) {
      console.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}.`
      );
      return;
    }

    // 9) 전송
    await sendReservations(hotelId, siteName, uniqueReservations);
    console.info(
      `GoodMotel reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} for hotelId ${hotelId}:`,
      error.message
    );
    throw error;
  } finally {
    // 탭 닫지 않고 유지
    if (page) {
      // await page.close();
      console.info(`페이지 유지: ${siteName} for hotelId: ${hotelId}.`);
    }
  }
};

export default scrapeGoodChoiceMotel;
