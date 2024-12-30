import React, { useEffect } from 'react';

function KakaoConfig() {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(process.env.REACT_APP_KAKAO_JS_KEY);
        console.log('Kakao SDK initialized:', window.Kakao.isInitialized());
      }
    }
  }, []);

  return null;
}

export default KakaoConfig;
