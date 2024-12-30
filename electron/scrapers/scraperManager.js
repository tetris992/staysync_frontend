import schedule from 'node-schedule';
import dotenv from 'dotenv';
import connectToChrome from './browserConnection.js';
import Expedia from './otas/expedia.js';
import Yanolja from './otas/yanolja.js';
import GoodHotel from './otas/goodHotel.js';
import GoodMotel from './otas/goodMotel.js';
import Agoda from './otas/agoda.js';
import CoolStay from './otas/coolStay.js';
import Booking from './otas/booking.js';
import availableOTAs from './availableOTAs.js';
import { getScraping } from './scrapingStatus.js';
import Store from 'electron-store'; // ★ 추가
import { fetchHotelSettings } from './api.js';

dotenv.config();
const store = new Store(); // ★ 추가

class ScraperManager {
  constructor() {
    this.browserInstance = null;
    this.initialized = false;
    this.scraperFunctions = {
      Expedia,
      Yanolja,
      GoodHotel,
      GoodMotel,
      Agoda,
      CoolStay,
      Booking,
    };

    // ========== [수정 #2: autoScrapeInterval 제거] ==========
    // 기존에 2시간 간격으로 setInterval을 저장하던 변수를 제거.
    // this.autoScrapeInterval = null;

    // ========== [수정 #3: scheduleJob 목록을 관리할 배열 추가] ==========
    this.scheduledJobs = [];
  }

  async initialize(browserInstance) {
    if (!browserInstance) {
      this.browserInstance = await connectToChrome();
    } else {
      this.browserInstance = browserInstance;
    }
    console.info('Browser instance ready for scraping.');
    this.initialized = true;

    // ========== [수정 #4: node-schedule 스케줄 등록으로 변경] ==========
    // 기존에 2시간마다 setInterval(() => this.autoScrape(), 2*60*60*1000) 하던 것을 삭제하고
    // 새벽2시 / 오후3시~8시 30분 간격 / 나머지 시간대 1시간 간격 등 조건별로 크론 스케줄 등록

    // 1) 매일 새벽 2시 정각(02:00)에 단 한 번
    const jobAt2AM = schedule.scheduleJob('0 2 * * *', () => {
      this.autoScrapeWithTag('[새벽 2시 단발]');
    });
    this.scheduledJobs.push(jobAt2AM);

    // 2) 매일 오후 3시~7시59분(15~19) 사이 30분 간격
    //    (매시 0분, 30분에 실행 => 예: 15:00, 15:30, 16:00 ...)
    const jobEvery30Min = schedule.scheduleJob('*/30 15-19 * * *', () => {
      this.autoScrapeWithTag('[오후3시~8시 30분 간격]');
    });
    this.scheduledJobs.push(jobEvery30Min);

    // 3) 나머지 시간(07:00~14:59, 20:00~01:59)에는 1시간 간격
    //    여기서는 편의를 위해 두 개의 스케줄로 나누어 등록

    // 3-1) 오전 7시~14시(7~14) 매 정시(0분)에 실행
    const jobHourlyMorning = schedule.scheduleJob('0 7-14 * * *', () => {
      this.autoScrapeWithTag('[오전7~오후2시까지 매시]');
    });
    this.scheduledJobs.push(jobHourlyMorning);

    // 3-2) 오후 8시~밤 12시(20~23) 그리고 새벽 0시~1시(0~1) 매 정시에 실행
    //    크론식에서 "0-1,20-23" 처럼 쉼표로 구간을 합칠 수 있음.
    const jobHourlyNight = schedule.scheduleJob('0 20-23,0-1 * * *', () => {
      this.autoScrapeWithTag('[오후8시~새벽2시까지 매시]');
    });
    this.scheduledJobs.push(jobHourlyNight);
  }

  // ========== [수정 #5: autoScrape 로직을 공용 메서드로 래핑] ==========
  // node-schedule에서 호출될 때, 어떤 시점인지 구분하기 위해 tag를 인자로 받음.
  async autoScrapeWithTag(tag = '') {
    console.info(`autoScrape triggered by schedule. Tag: ${tag}`);
    await this.autoScrape();
  }

  async ensureBrowser() {
    if (!this.browserInstance || !this.browserInstance.isConnected()) {
      console.log(
        '[ScraperManager] Re-initializing browser (no instance or not connected)'
      );
      this.browserInstance = await connectToChrome();
      return;
    }

    try {
      const testPage = await this.browserInstance.newPage();
      await testPage.close();
    } catch (err) {
      console.warn(
        '[ScraperManager] newPage() failed => browser is actually dead, re-initializing...'
      );
      this.browserInstance = await connectToChrome();
    }
  }

  async scrapeNow(hotelId, otaName) {
    if (!this.initialized || !this.browserInstance) {
      console.warn('ScraperManager not initialized or browser not ready.');
      return;
    }

    await this.ensureBrowser(); // 브라우저 살아있는지 체크

    const taskFunction = this.scraperFunctions[otaName];
    if (!taskFunction) {
      console.warn(`Unsupported OTA: ${otaName}`);
      return;
    }

    try {
      console.info(
        `Starting immediate scrape for ${otaName}, hotelId: ${hotelId}`
      );
      await taskFunction(hotelId, otaName, this.browserInstance);
      console.info(`Scrape completed for ${otaName}, hotelId: ${hotelId}`);
    } catch (error) {
      console.error(
        `Scraping failed for ${otaName}, hotelId: ${hotelId}:`,
        error.message
      );
    }
  }

  async autoScrape() {
    // 기존 autoScrape 내용 그대로 유지
    if (!this.initialized || !this.browserInstance) return;
    if (!getScraping()) {
      console.info('Scraping is currently disabled. Skipping auto scrape.');
      return;
    }

    const hotelId = store.get('hotelId');
    if (!hotelId) {
      console.warn('No hotelId available. Skipping auto scrape.');
      return;
    }

    console.info('Auto scraping triggered...');
    const hotelSettings = await fetchHotelSettings(hotelId);
    if (!hotelSettings || !hotelSettings.otas) return;

    const activeOTAList = hotelSettings.otas
      .filter((o) => o.isActive)
      .map((o) => o.name);

    for (const otaName of availableOTAs) {
      if (activeOTAList.includes(otaName)) {
        await this.scrapeNow(hotelId, otaName);
      } else {
        console.info(`OTA ${otaName} not active for ${hotelId}, skipping.`);
      }
    }
  }

  async stopAll() {
    console.info('Stopping all scrapes and intervals.');

    // ========== [수정 #6: node-schedule 스케줄 취소 로직 추가] ==========
    // 이전에 사용하던 clearInterval() 대신,
    // this.scheduledJobs 배열에 등록된 각 job에 대해 cancel() 호출
    this.scheduledJobs.forEach((job) => {
      job.cancel();
    });
    this.scheduledJobs = [];

    // 혹시 기존 setInterval이 있었다면 clearInterval 처리 (여기선 이미 삭제했지만 혹시 모를 대비)
    if (this.autoScrapeInterval) {
      clearInterval(this.autoScrapeInterval);
      this.autoScrapeInterval = null;
    }

    if (this.browserInstance) {
      await this.browserInstance.close();
      console.info('Browser instance closed.');
      this.browserInstance = null;
    }
    this.initialized = false;
  }
}

const scraperManager = new ScraperManager();
export default scraperManager;
