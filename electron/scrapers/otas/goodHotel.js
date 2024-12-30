// src/render/scrapers/goodHotel.js

import { sendReservations } from '../scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동하는 헬퍼 함수
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  // 1) 열려 있는 탭 목록
  const pages = await browser.pages();

  // 2) urlKeyword(예: 'partner.goodchoice.kr')가 포함된 탭이 있는지 확인
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    // 탭이 없다면 새로 생성
    targetPage = await browser.newPage();
    console.log(`Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle0',
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
 * GoodChoice Hotel 스크래퍼 함수
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'GoodHotel')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
const scrapeGoodChoiceHotel = async (hotelId, siteName, browserInstance) => {
  let page;
  try {
    // 1) partner.goodchoice.kr 도메인 탭을 찾고, 없으면 새 탭 + fallbackURL 이동
    page = await findOrCreatePage(
      browserInstance,
      'partner.goodchoice.kr',
      'https://partner.goodchoice.kr/reservations/reservation-list'
    );
    console.info(
      `GoodChoice Hotel tab is ready (reused or created) for hotelId: ${hotelId}`
    );

    // 2) 공통 설정
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 3) 혹시 사용자가 다른 페이지로 이동했을 수 있으므로,
    //    다시 예약 리스트 페이지로 이동 보장 (원하면 생략 가능)
    try {
      await page.goto(
        'https://partner.goodchoice.kr/reservations/reservation-list',
        {
          waitUntil: 'networkidle0',
          timeout: 60000,
        }
      );
      console.info(
        `Navigated to reservation page: ${siteName} for hotelId: ${hotelId}`
      );
    } catch (error) {
      console.error(
        `Error navigating to reservation page for hotelId ${hotelId}:`,
        error.message
      );
      // 기존 코드에서 page.close() → 주석 처리 (탭 유지)
      // await page.close();
      throw new Error(
        'Failed to navigate to GoodChoice Hotel reservation page'
      );
    }

    // 4) 기존 코드와 동일: 월별 드롭다운, 50개 보기 등 클릭 로직
    const monthDropdownSelector =
      '#__next > div > div > main > section > div.css-1kiy3dg.eobbxyy1 > div:nth-child(2) > button';
    await page.waitForSelector(monthDropdownSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(monthDropdownSelector);
    console.info('월별 드롭다운 버튼 클릭');

    const selectMonthSelector =
      '#__next > div > div > main > section > div.css-1kiy3dg.eobbxyy1 > div:nth-child(2) > div > ul > li:nth-child(3) > button';
    await page.waitForSelector(selectMonthSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(selectMonthSelector);
    console.info('드롭 메뉴에서 특정 월 선택');

    const view10ButtonSelector =
      '#__next > div > div > main > section > div.css-6obysj.e7w8kta5 > div.css-1bg37p3.e7w8kta2 > div.css-j2u1gu.eifwycs3 > button';
    await page.waitForSelector(view10ButtonSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(view10ButtonSelector);
    console.info('기본 10개 보기 버튼 클릭');

    const view50ButtonSelector =
      '#__next > div > div > main > section > div.css-6obysj.e7w8kta5 > div.css-1bg37p3.e7w8kta2 > div.css-j2u1gu.eifwycs3 > div > ul > li:nth-child(3) > button';
    await page.waitForSelector(view50ButtonSelector, {
      visible: true,
      timeout: 10000,
    });
    await page.click(view50ButtonSelector);
    console.info('50개씩 보기 드롭 메뉴 클릭');

    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(2000);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.info('필요한 클릭 동작 완료 및 페이지 로딩 대기');

    // 5) 예약 정보 추출
    const reservationData = [];
    const reservations = await page.$$eval('table > tbody > tr', (rows) =>
      rows.map((row) => {
        const reservationStatusCell = row.querySelector('td:nth-child(1)');
        const reservationStatus = reservationStatusCell
          ? reservationStatusCell.innerText.trim().split('\n')[0].trim()
          : '';

        const reservationNoCell = row.querySelector('td:nth-child(2)');
        const reservationNo = reservationNoCell
          ? reservationNoCell.innerText.trim().split('\n')[0].trim()
          : '';

        const customerNameCell = row.querySelector('td:nth-child(3)');
        const customerName = customerNameCell
          ? customerNameCell.innerText.trim().split('\n')[0].trim()
          : '';

        const roomInfoCell = row.querySelector('td:nth-child(4)');
        const roomInfo = roomInfoCell
          ? roomInfoCell.innerText.trim().split('\n')[0].trim()
          : '';

        const checkInCell = row.querySelector(
          'td:nth-child(5) > div:nth-child(1) > p'
        );
        const checkIn = checkInCell ? checkInCell.innerText.trim() : '';

        const checkOutCell = row.querySelector(
          'td:nth-child(5) > div:nth-child(2) > p'
        );
        const checkOut = checkOutCell ? checkOutCell.innerText.trim() : '';

        const priceCell = row.querySelector('td:nth-child(6)');
        const price = priceCell
          ? priceCell.innerText.trim().split('\n')[0].trim()
          : '';

        const reservationDateCell = row.querySelector('td:nth-child(8)');
        const reservationDate = reservationDateCell
          ? reservationDateCell.innerText.trim()
          : '';

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
    );

    reservationData.push(...reservations);
    console.info('Extracted Reservation Data:', reservationData);

    // 6) 조건 체크 후 서버 전송
    if (!reservations || reservations.length === 0) {
      console.info(
        `No reservations found for ${siteName} for hotelId: ${hotelId}. No data sent.`
      );
      return;
    }
    await sendReservations(hotelId, siteName, reservations);
    console.info(
      `${siteName} reservations successfully saved for hotelId ${hotelId}.`
    );
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} for hotelId ${hotelId}:`,
      error.message
    );
    throw error;
  } finally {
    // 탭을 닫지 않고 유지
    if (page) {
      // await page.close();
      console.info(`페이지 유지: for ${siteName} for hotelId: ${hotelId}.`);
    }
  }
};

export default scrapeGoodChoiceHotel;
