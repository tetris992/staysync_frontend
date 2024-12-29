// src/render/scrapers/scrapeAgoda.js

import moment from 'moment';
import { sendReservations } from '../scrapeHelper.js';
import { fetchHotelSettings } from '../../src/render/api/api.js'; // API 경로 맞춰야 함

// --- (유틸) 한글 여부 판별
function isKorean(str) {
  if (!str || str.length === 0) return false;
  const code = str.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

// --- 동의어 사전
const synonyms = {
  double: ['double', '더블'],
  twin: ['twin', '트윈'],
  hinoki: ['hinoki', '히노키'],
  // terrace: ['terrace', '테라스'],
};

function partialLangMatch(scrapedWord, roomTypeWord) {
  const scrapedIsKorean = isKorean(scrapedWord);
  const roomIsKorean = isKorean(roomTypeWord);

  if (scrapedIsKorean !== roomIsKorean) return false;

  if (scrapedIsKorean) {
    // 한글은 앞 2글자 비교
    if (scrapedWord.length < 2 || roomTypeWord.length < 2) return false;
    return scrapedWord.slice(0, 2) === roomTypeWord.slice(0, 2);
  } else {
    // 영문은 앞 3글자
    if (scrapedWord.length < 3 || roomTypeWord.length < 3) return false;
    return scrapedWord.slice(0, 3) === roomTypeWord.slice(0, 3);
  }
}

function partialSynonymMatch(scrapedWord, roomTypeWord) {
  for (const canonicalForm in synonyms) {
    const variants = synonyms[canonicalForm];
    const scrapedMatches = variants.some((v) =>
      partialLangMatch(scrapedWord, v)
    );
    const roomMatches = variants.some((v) => partialLangMatch(roomTypeWord, v));
    if (scrapedMatches && roomMatches) {
      return true;
    }
  }
  return false;
}

function partialMatch(scrapedWord, roomTypeWord) {
  // 직접 일치 / 동의어
  if (partialLangMatch(scrapedWord, roomTypeWord)) return true;
  if (partialSynonymMatch(scrapedWord, roomTypeWord)) return true;
  return false;
}

function findBestMatchingRoomType(scrapedRoomName, savedRoomTypes) {
  if (!scrapedRoomName) return null;

  const lowerScrapedName = scrapedRoomName.toLowerCase();
  const scrapedWords = lowerScrapedName.split(/[\s\-]+/);

  const roomTypeScores = savedRoomTypes.map((roomType) => {
    // roomType 정보를 여러 단어로 분리해서 비교
    const roomTypeWords = [
      ...roomType.type.toLowerCase().split(/[\s\-]+/),
      ...roomType.nameKor.toLowerCase().split(/[\s\-]+/),
      ...roomType.nameEng.toLowerCase().split(/[\s\-]+/),
      ...(roomType.aliases
        ? roomType.aliases.flatMap((alias) =>
            alias.toLowerCase().split(/[\s\-]+/)
          )
        : []),
    ].filter((w) => w.length > 0);

    const matchedWords = scrapedWords.filter((scrapedWord) =>
      roomTypeWords.some((rtWord) => partialMatch(scrapedWord, rtWord))
    );
    let matchCount = matchedWords.length;

    // 부분 문자열 매칭 보완
    if (matchCount < 2) {
      const substringMatches = roomTypeWords.filter(
        (rtWord) => rtWord.length > 0 && lowerScrapedName.includes(rtWord)
      );
      matchCount += substringMatches.length;
    }

    return {
      roomType: roomType.type.toLowerCase(),
      matchCount,
      matchWords: matchedWords,
    };
  });

  roomTypeScores.sort((a, b) => b.matchCount - a.matchCount);
  const bestMatch = roomTypeScores[0];

  if (bestMatch.matchCount > 1) {
    console.info(
      `Best match for "${scrapedRoomName}": "${bestMatch.roomType}" with ` +
        `${bestMatch.matchCount} matched score (${bestMatch.matchWords.join(
          ', '
        )})`
    );
    return bestMatch.roomType;
  }

  console.warn(
    `No suitable match found for "${scrapedRoomName}". Using general default price.`
  );
  return null;
}

/**
 * 이미 열려 있는 탭 중 특정 도메인을 포함하는 탭을 찾고,
 * 없으면 newPage()로 새 탭을 생성해 fallbackURL로 이동
 */
async function findOrCreatePage(browser, urlKeyword, fallbackURL) {
  const pages = await browser.pages();
  let targetPage = pages.find((p) => p.url().includes(urlKeyword));

  if (!targetPage) {
    targetPage = await browser.newPage();
    console.log(`[Agoda] Creating new tab for ${urlKeyword}...`);
    if (fallbackURL) {
      await targetPage.goto(fallbackURL, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    }
  } else {
    console.log(`[Agoda] Reusing existing tab for ${urlKeyword}`);
    await targetPage.bringToFront();
  }
  return targetPage;
}

/**
 * Agoda 스크래퍼 함수
 * @param {String} hotelId - 우리 시스템 호텔 ID
 * @param {String} siteName - 예약 사이트 이름 (예: 'Agoda')
 * @param {Browser} browserInstance - Puppeteer Browser 인스턴스
 */
async function scrapeAgoda(hotelId, siteName, browserInstance) {
  let page;
  try {
    console.info(`[Agoda] Starting scrape for hotelId: ${hotelId}`);

    // 1) 호텔 설정 정보 로드 (API)
    const hotelSettings = await fetchHotelSettings(hotelId);
    if (!hotelSettings) {
      throw new Error(
        `hotelId: ${hotelId}에 해당하는 호텔 설정을 찾을 수 없습니다.`
      );
    }

    // 2) 룸타입별 가격 매핑
    const roomTypePriceMap = {};
    hotelSettings.roomTypes.forEach((roomType) => {
      roomTypePriceMap[roomType.type.toLowerCase()] = roomType.price;
    });
    const generalDefaultPrice = 100000; // 기본값

    // 3) 날짜 범위 계산
    const today = moment();
    const formattedToday = today.format('DD-MM-YYYY'); // 날짜 포맷: DD-MM-YYYY
    const endDate = moment().add(30, 'days').format('DD-MM-YYYY');

    // 4) Agoda 대시보드(임시) + 도메인 "ycs.agoda.com"
    //    fallbackID로 18989082 임시 입력
    const fallbackAgodaId = '18989082';
    const fallbackDashboardUrl = `https://ycs.agoda.com/mldc/ko-kr/app/reporting/dashboard/${fallbackAgodaId}`;
    page = await findOrCreatePage(
      browserInstance,
      'ycs.agoda.com',
      fallbackDashboardUrl
    );

    // 5) 간단 설정
    await page.setCacheEnabled(false);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.setViewport({ width: 2080, height: 1680 });

    // 6) 현재 URL에서 실제 Agoda ID 추출 (예: dashboard/123456)
    const currentUrl = page.url();
    // 예: https://ycs.agoda.com/mldc/ko-kr/app/reporting/dashboard/18989082
    let realAgodaId = fallbackAgodaId;
    const match = currentUrl.match(/dashboard\/(\d+)/);
    if (match && match[1]) {
      realAgodaId = match[1];
    }
    console.log(`[Agoda] Detected agodaHotelId from address: ${realAgodaId}`);

    // 7) 예약 페이지로 이동
    const bookingUrl =
      `https://ycs.agoda.com/mldc/ko-kr/app/reporting/booking/${realAgodaId}` +
      `?startDate=${formattedToday}&endDate=${endDate}`;
    console.info(
      `[Agoda] Navigating to booking page. date range ${formattedToday} ~ ${endDate}`
    );
    try {
      await page.goto(bookingUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });
    } catch (error) {
      console.error(
        `Failed to navigate to the reservation page: ${error.message}`
      );
      throw new Error('Failed to navigate to Agoda reservation page');
    }

    // 8) 테이블 로딩 대기: 예) #root 로딩 후 + 10초 대기 (버전에 따라)
    await page.waitForSelector('#root', { timeout: 30000 });
    // await new Promise((resolve) => setTimeout(resolve, 10000));  // 필요 시 추가 대기

    // 9) 예약 정보 추출
    const scrapedReservations = await page.$$eval(
      'table > tbody > tr',
      (rows) =>
        rows
          .map((row) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 6) return null;

            const rawReservationNo = cells[0]?.innerText.trim() || '';
            const customerName = cells[1]?.innerText.trim() || '';
            let roomInfo = cells[3]?.innerText.trim() || '';
            const paymentMethod = cells[4]?.innerText.trim() || '';
            // 예약 날짜는 현재 checkIn과 동일하게 처리 중
            const reservationDate = cells[5]?.innerText.trim() || '';

            // 체크인/체크아웃 DOM
            const checkInElement = row.querySelector(
              'td:nth-child(3) > div > p:nth-child(1)'
            );
            const checkOutElement = row.querySelector(
              'td:nth-child(3) > div > p:nth-child(2)'
            );
            const checkIn = checkInElement
              ? checkInElement.innerText.trim()
              : '';
            const checkOut = checkOutElement
              ? checkOutElement.innerText.trim()
              : '11:00';

            let reservationStatus = 'Confirmed';
            let reservationNo = rawReservationNo;

            // 상태 분기
            if (rawReservationNo.includes('취소된 예약')) {
              reservationNo = rawReservationNo
                .replace('취소된 예약', '')
                .trim();
              reservationStatus = 'Canceled';
            } else if (rawReservationNo.includes('확정된 예약')) {
              reservationNo = rawReservationNo
                .replace('확정된 예약', '')
                .trim();
              reservationStatus = 'Confirmed';
            }

            // roomInfo 너무 길면 잘라내기
            if (roomInfo.length > 50) {
              roomInfo = roomInfo.substring(0, 50);
            }

            return {
              reservationStatus,
              reservationNo,
              customerName,
              roomInfo,
              checkIn,
              checkOut,
              paymentMethod,
              reservationDate: checkIn, // 기존 코드 관례
            };
          })
          .filter((r) => r !== null)
    );

    if (!scrapedReservations || scrapedReservations.length === 0) {
      console.info(
        `No reservations found for ${siteName} (hotelId: ${hotelId}) in date range ` +
          `${formattedToday} ~ ${endDate}.`
      );
      return;
    }

    // 10) 룸타입 매칭 + 가격 할당
    for (let i = 0; i < scrapedReservations.length; i++) {
      const reservation = scrapedReservations[i];
      const { roomInfo, reservationNo } = reservation;

      let matchedRoomType = null;
      let assignedPrice = generalDefaultPrice;

      try {
        if (!roomInfo || roomInfo.trim().length === 0) {
          console.warn(
            `Reservation No: ${reservationNo} - No roomInfo. Using default price: ${assignedPrice}`
          );
        } else {
          matchedRoomType = findBestMatchingRoomType(
            roomInfo,
            hotelSettings.roomTypes
          );
          if (!matchedRoomType) {
            console.warn(
              `Reservation No: ${reservationNo} - No room type matched. ` +
                `Using default price: ${assignedPrice}`
            );
          } else {
            // 룸타입 가격이 유효하면 assignedPrice 갱신
            if (
              roomTypePriceMap[matchedRoomType] !== undefined &&
              !isNaN(roomTypePriceMap[matchedRoomType]) &&
              roomTypePriceMap[matchedRoomType] > 0
            ) {
              assignedPrice = roomTypePriceMap[matchedRoomType];
              console.info(
                `Reservation No: ${reservationNo} - Matched Room Type: ` +
                  `"${matchedRoomType}", Price: ${assignedPrice}`
              );
            } else {
              console.warn(
                `Reservation No: ${reservationNo} - Room Type: "${matchedRoomType}", ` +
                  `but no valid price. Using default: ${assignedPrice}`
              );
            }
          }
        }
        // 최종 할당
        scrapedReservations[i] = {
          ...reservation,
          price: assignedPrice,
          matchedRoomType: matchedRoomType || null,
        };
      } catch (error) {
        console.error(
          `Failed to process reservation ${reservationNo}; fallback to default price: ` +
            `${assignedPrice}. Error: ${error.message}`
        );
        scrapedReservations[i] = {
          ...reservation,
          price: assignedPrice,
          matchedRoomType: null,
        };
      }
    }

    // 11) 서버 전송
    await sendReservations(hotelId, siteName, scrapedReservations);
    console.info(`[Agoda] Reservations saved. hotelId: ${hotelId}`);
  } catch (error) {
    console.error(
      `Scraping failed for ${siteName} (hotelId: ${hotelId}):`,
      error.message
    );
    throw error;
  } finally {
    if (page) {
      // 여기서는 페이지를 닫지 않고 계속 유지
      console.info(
        `(Agoda) Page kept open for ${siteName}, hotelId: ${hotelId}.`
      );
    }
  }
}

export default scrapeAgoda;
