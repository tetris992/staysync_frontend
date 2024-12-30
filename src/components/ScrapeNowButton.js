// ScrapeNowButton.js
import React, { useState, useEffect } from 'react';
import './ScrapeNowButton.css';
import { FaClipboardCheck } from 'react-icons/fa';

const ScrapeNowButton = ({ hotelId, activeOTAs }) => {
  const [isScraping, setIsScraping] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const COOLDOWN_TIME = 10 * 1000; // 10초

  // 컴포넌트 마운트 시점에 window.Electron 확인
  useEffect(() => {
    console.log('[Renderer] ScrapeNowButton mount');
    console.log('[Renderer] window.Electron:', window.Electron);
    // 만약 "undefined"가 뜨면 preload가 로드되지 않았을 가능성이 있습니다.
  }, []);

  const handleScrapeNow = async () => {
    console.log('[Renderer] handleScrapeNow 클릭됨');
    if (isScraping || cooldown) {
      console.log('[Renderer] 이미 스크래핑 중이거나 쿨다운 중');
      return;
    }

    if (!activeOTAs || activeOTAs.length === 0) {
      alert('활성화된 OTA가 없습니다.');
      console.warn('[Renderer] 활성화된 OTA가 없음');
      return;
    }

    setIsScraping(true);
    try {
      // (A) ensureBrowser IPC 먼저 호출
     if (!window.Electron?.invoke) {
       throw new Error('Electron.invoke 가 존재하지 않음! preload 설정 확인 요망.');
     }
     console.log('[Renderer] ensureBrowser IPC 호출 시도');
     const ensureResult = await window.Electron.invoke('scraperManagerEnsureBrowser');
     if (!ensureResult.success) {
       console.error('Browser ensure failed:', ensureResult.message);
       alert('브라우저 세션 복구 실패! 다시 시도해주세요.');
       return;
     }
     console.log('[Renderer] 브라우저 인스턴스 보장 완료');

      // 1) window.Electron 존재 여부
      if (!window.Electron) {
        throw new Error('Electron API가 정의되어 있지 않습니다.');
      }

      // 2) scrapeNow 함수 존재 여부
      if (!window.Electron.scrapeNow) {
        throw new Error('Electron.scrapeNow가 정의되어 있지 않습니다.');
      }

      // 3) 로그 전송
      console.log('[Renderer] window.Electron.log 호출');
      window.Electron.log('ScrapeNowButton 클릭됨');

      // 4) test 메서드 호출
      if (window.Electron.test) {
        console.log('[Renderer] test 메서드 존재함. 호출해봄.');
        const testResult = window.Electron.test();
        console.log('[Renderer] Test 메서드 결과:', testResult);
        window.Electron.log('Test 메서드 결과: ' + testResult);
      }

      // 5) 환경 변수 확인
      console.log('[Renderer] 환경 변수 NODE_ENV:', window.Electron.env.NODE_ENV);
      window.Electron.log(
        '[Renderer] 환경 변수 NODE_ENV: ' + window.Electron.env.NODE_ENV
      );

      // 6) scrapeNow IPC 호출
      console.log('[Renderer] scrapeNow IPC 호출 시도');
      const result = await window.Electron.scrapeNow(hotelId, activeOTAs);
      console.log('[Renderer] 스크랩 완료:', result);
      window.Electron.log('스크랩 완료: ' + JSON.stringify(result));
    } catch (error) {
      // 에러 처리
      console.error('[Renderer] 즉시 스크랩 IPC 요청 실패:', error);
      if (window.Electron && window.Electron.log) {
        window.Electron.log('즉시 스크랩 IPC 요청 실패: ' + error.message);
      }
      alert('스크랩 요청에 실패했습니다.');
    } finally {
      // 스크래핑 종료 후 쿨다운
      setIsScraping(false);
      setCooldown(true);

      setTimeout(() => {
        setCooldown(false);
      }, COOLDOWN_TIME);
    }
  };

  return (
    <button
      className="scrape-now-button"
      onClick={handleScrapeNow}
      disabled={isScraping || cooldown}
    >
      {isScraping ? (
        <>
          <FaClipboardCheck className="onsite-icon" /> 예약 확인중...
        </>
      ) : cooldown ? (
        '새로운 예약 확인중..'
      ) : (
        <>
          <FaClipboardCheck className="onsite-icon" /> 새로운 예약
        </>
      )}
    </button>
  );
};

export default ScrapeNowButton;
