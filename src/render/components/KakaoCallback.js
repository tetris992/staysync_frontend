// src/components/KakaoCallback.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import queryString from 'query-string';

const KakaoCallback = ({ onLogin }) => {
  const [error, setError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // 1) URL 파라미터 파싱
    const parsed = queryString.parse(location.search);
    const { code, error, error_description, accessToken, isRegistered } =
      parsed;

    // 2) 에러 체크
    if (error) {
      setError(`카카오 로그인 실패: ${error}, ${error_description || ''}`);
      return;
    }

    // [A] 백엔드가 최종적으로 ?accessToken=xxx & isRegistered=xxx 로 리다이렉트한 경우
    if (accessToken) {
      onLogin(accessToken, null);

      if (isRegistered === 'false') {
        // 아직 호텔 세팅이 안 된 사용자 → 별도 안내
        alert('호텔 설정이 아직 완료되지 않았습니다.');
      }

      navigate('/');
      return;
    }

    // (B) code만 있는 경우 => sendKakaoCodeToServer(code)?
    if (code) {
      // (주석)
      // sendKakaoCodeToServer(code).then(...).catch(...);
      setError('백엔드와의 통신 로직 필요 (code만 넘어옴)');
    } else {
      setError('카카오 리다이렉트에 code/accessToken이 없습니다.');
    }
  }, [location.search, navigate, onLogin]);

  if (error) {
    return <div style={{ padding: '2rem', color: 'red' }}>{error}</div>;
  }

  return <div style={{ padding: '2rem' }}>카카오 로그인 처리 중...</div>;
};

export default KakaoCallback;
