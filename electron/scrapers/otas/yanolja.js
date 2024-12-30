// src/render/scrapers/yanolja.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js'; // 공통 헬퍼 모듈 임포트
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

/**
 * 특정 페이지에서 예약 정보를 추출하는 함수
 * @param {Page} page - Puppeteer Page 인스턴스
 * @returns {Array} reservations - 추출된 예약 정보 배열
 */
const extractReservations = async (page) => {
  return await page.$$eval('table > tbody > tr', (rows) =>
    rows
      .map((row) => {
        const reservationNo = row
          .querySelector('td.ReservationSearchListItem__no > span')
          ?.innerText.trim();
        const reservationStatus = row
          .querySelector('td.ReservationSearchListItem__status')
          ?.innerText.trim();
        const customerName = row
          .querySelector(
            'td.ReservationSearchListItem__visitor > span:nth-child(1)'
          )
          ?.innerText.trim();
        const roomInfo = row
          .querySelector('td.ReservationSearchListItem__roomInfo')
          ?.innerText.trim();

        const checkInRaw = row
          .querySelector('td.ReservationSearchListItem__date')
          ?.innerText.trim();
        const checkIn = checkInRaw ? checkInRaw.split('\n')[0].trim() : null;

        const checkOut = row
          .querySelector(
            'td.ReservationSearchListItem__date > span:nth-child(2)'
          )
          ?.innerText.trim();
        const reservationDate = row
          .querySelector('td.ReservationSearchListItem__reservation')
          ?.innerText.trim();
        const price = row
          .querySelector('td.ReservationSearchListItem__price')
          ?.innerText.trim();

        return {
          reservationNo,
          customerName,
          roomInfo,
          checkIn,
          checkOut,
          reservationDate,
          reservationStatus,
          price,
        };
      })
      .filter((reservation) => reservation !== null)
  );
};

/**
 * 숙소 전환 함수
 * @param {Page} page - Puppeteer Page 인스턴스
 * @param {String} desiredAccommodationName - 선택하고자 하는 숙소 이름
 * @returns {Boolean} - 전환 성공 여부
 */
const switchAccommodation = async (page, desiredAccommodationName) => {
  try {
    console.info(`Attempting to find dropdown button...`);
    const firstButtonSelector =
      '#root > div.MuiBox-root.css-0 > header > div > div > div:nth-child(1) > button:nth-child(2)';

    await page.waitForSelector(firstButtonSelector, { timeout: 20000 });
    const firstButton = await page.$(firstButtonSelector);
    if (!firstButton) {
      throw new Error('드롭다운 버튼을 찾을 수 없습니다.');
    }
    await firstButton.evaluate((el) => el.scrollIntoView());
    await firstButton.click();
    console.info('드롭다운 버튼 클릭 완료');

    const dropdownContentSelector =
      '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18';
    await page.waitForSelector(dropdownContentSelector, { timeout: 15000 });
    console.info('드롭다운 메뉴 로드 완료');

    const secondButtonSelector =
      '#app-bar-property-info > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-1dmzujt > div > div > div.MuiStack-root.css-9jay18 > button';
    await page.waitForSelector(secondButtonSelector, { timeout: 15000 });
    const secondButton = await page.$(secondButtonSelector);
    if (!secondButton) {
      console.warn('(다른 숙소 선택)을 찾을 수 없습니다.');
      return false;
    }
    await secondButton.evaluate((el) => el.scrollIntoView());
    await secondButton.click();

    const accommodationListSelector =
      'body > div.MuiPopover-root.e1d6lcwf6.MuiModal-root.css-1xyay8i > div.MuiPaper-root.MuiPaper-elevation.MuiPaper-rounded.MuiPaper-elevation8.MuiPopover-paper.css-17c12ww > ul > div > div > div > span';
    await page.waitForSelector(accommodationListSelector, { timeout: 15000 });

    const accommodationElement = await page.$(accommodationListSelector);
    if (!accommodationElement) {
      console.warn(`숙소 '${desiredAccommodationName}'를 찾을 수 없습니다.`);
      return false;
    }
    await accommodationElement.evaluate((el) => el.scrollIntoView());
    await accommodationElement.click();

    return true;
  } catch (error) {
    console.error(`숙소 전환 중 오류 발생: ${error.message}`);
    return false;
  }
};

/**
 * 특정 도메인을 포함하는 탭(Page)이 열려있으면 재활용하고,
 * 없으면 newPage()로 새 탭을 생성한 뒤, fallbackURL로 이동
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  const pages = await browser.pages();
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    // 새 탭 생성
    targetPage = await browser.newPage();
    console.log(`Creating new tab for ${urlKeyword}`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
    }
  } else {
    // 이미 열려있으면 그 탭을 앞으로
    console.log(`Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }
  return targetPage;
}

/**
 * YanoljaMotel 스크래퍼 함수
 *
 * @param {String} hotelId - 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'YanoljaMotel')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스 (ScraperManager에서 주입)
 */
const scrapeYanolja = async (hotelId, siteName, browserInstance) => {
  let browser;
  let page;
  try {
    // 1) 외부에서 받은 browserInstance 사용
    browser = browserInstance;
    console.info('브라우저 인스턴스를 전달받았습니다.');

    // 2) "partner.yanolja.com" 탭이 있으면 재활용, 없으면 새 탭
    //    fallbackURL로 "https://partner.yanolja.com/reservation/search" 이동
    page = await findOrCreatePage(
      browser,
      'partner.yanolja.com',
      'https://partner.yanolja.com/reservation/search'
    );
    console.info('Yanolja tab is ready (reused or created).');

    // 3) 추가 설정
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 4) 날짜 계산
    const today = moment();
    const thirtyDaysLater = moment().add(30, 'days');
    const startDate = today.format('YYYY-MM-DD');
    const endDate = thirtyDaysLater.format('YYYY-MM-DD');

    // 5) 예약 목록 URL
    const url = `https://partner.yanolja.com/reservation/search?dateType=CHECK_IN_DATE&startDate=${startDate}&endDate=${endDate}&reservationStatus=ALL&keywordType=VISITOR_NAME&page=1&size=50&sort=checkInDate,desc&propertyCategory=MOTEL&checkedIn=STAY_STATUS_ALL&selectedDate=${today.format(
      'YYYY-MM-DD'
    )}&searchType=detail&useTypeDetail=ALL&useTypeCheckIn=ALL`;

    // 첫 번째 스크래핑
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      console.info(
        `야놀자 예약 검색 페이지 접속: 날짜 범위 ${startDate} ~ ${endDate}`
      );
    } catch (error) {
      console.error(
        `호텔 ID ${hotelId} 예약 검색 페이지 이동 중 오류: ${error.message}`
      );
      return;
    }

    const reservations = await extractReservations(page);
    console.info(
      `추출된 예약 데이터: ${JSON.stringify(reservations, null, 2)}`
    );

    if (!reservations || reservations.length === 0) {
      console.info(`${siteName} (${hotelId})에 예약 없음. 서버 전송 생략.`);
    } else {
      await sendReservations(hotelId, siteName, reservations);
      console.info(`${siteName} 예약 정보 저장 완료 (hotelId: ${hotelId}).`);
    }

    // 메인 페이지로 복귀
    try {
      console.info('첫 번째 스크래핑 후, 메인 페이지로 이동합니다.');
      await page.goto('https://partner.yanolja.com/', {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
      console.info('메인 페이지 이동 완료.');
    } catch (error) {
      console.error(`메인 페이지 이동 오류: ${error.message}`);
      return;
    }

    // 숙소 전환 로직
    const desiredAccommodationName = '숙소전환(모텔<-->호텔)';
    const switchSuccess = await switchAccommodation(
      page,
      desiredAccommodationName
    );

    if (switchSuccess) {
      console.info('숙소 전환 성공.');

      // 두 번째 스크래핑
      try {
        await page.goto('https://partner.yanolja.com/reservation/search', {
          waitUntil: 'networkidle0',
          timeout: 60000,
        });
        console.info('두 번째 예약 검색 페이지 이동 완료.');
      } catch (error) {
        console.error(`두 번째 예약 검색 페이지 이동 오류: ${error.message}`);
        return;
      }

      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        console.info(
          `두 번째 예약 검색 URL 이동 완료: 범위 ${startDate} ~ ${endDate}`
        );
      } catch (error) {
        console.error(`두 번째 예약 목록 페이지 이동 오류: ${error.message}`);
        return;
      }

      const newReservations = await extractReservations(page);
      console.info(
        `숙소 전환 후 추출된 예약: ${JSON.stringify(newReservations, null, 2)}`
      );

      if (newReservations && newReservations.length > 0) {
        await sendReservations(hotelId, siteName, newReservations);
        console.info(
          `${siteName} 숙소 전환 후 예약 정보 저장 완료 (hotelId: ${hotelId}).`
        );
      } else {
        console.info(`${siteName} (${hotelId}) 숙소 전환 후 신규 예약 없음.`);
      }
    } else {
      console.warn('숙소 전환에 실패하였거나, 수동 전환 필요.');
    }
  } catch (error) {
    console.error(
      `스크래핑 실패: ${siteName} (hotelId: ${hotelId}) - ${error.message}`
    );
    throw error;
  } finally {
    // 탭 닫지 않고 유지
    if (page) {
      // await page.close();
      console.info(`탭을 닫지 않고 유지함: ${siteName} (hotelId: ${hotelId}).`);
    }
    // 브라우저 종료/해제는 ScraperManager.stopAll()에서만 처리
  }
};

export default scrapeYanolja;
