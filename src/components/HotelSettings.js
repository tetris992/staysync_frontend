// src/components/HotelSettings.js

import React, { useState, useEffect } from 'react';
import './HotelSettings.css';
import {
  fetchHotelSettings,
  fetchUserInfo,
  updateHotelSettings,
  registerHotel,
} from '../api.js';
import { defaultRoomTypes } from '../config/defaultRoomTypes.js';
import PropTypes from 'prop-types';

function HotelSettings({
  onClose,
  onSave,
  existingSettings = {
    hotelId: '',
    totalRooms: 0,
    roomTypes: defaultRoomTypes,
    email: '',
    address: '',
    phoneNumber: '',
  },
}) {
  const [hotelId, setHotelId] = useState(
    existingSettings?.hotelId || localStorage.getItem('hotelId') || ''
  );
  const [totalRooms, setTotalRooms] = useState(
    existingSettings?.totalRooms || ''
  );
  const [roomTypes, setRoomTypes] = useState(
    existingSettings?.roomTypes || defaultRoomTypes
  );
  const [address, setAddress] = useState(existingSettings?.address || '');
  const [phoneNumber, setPhoneNumber] = useState(
    existingSettings?.phoneNumber || ''
  );
  const [email, setEmail] = useState(existingSettings?.email || '');
  const [error, setError] = useState('');
  const [isExisting, setIsExisting] = useState(false);

  useEffect(() => {
    console.log('Existing Settings:', existingSettings);
  }, [existingSettings]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        let localUserInfo = null;
        // 로컬 스토리지에서 userInfo 가져오기
        const storedUserInfo = localStorage.getItem('userInfo');
        if (storedUserInfo) {
          try {
            localUserInfo = JSON.parse(storedUserInfo);
          } catch (e) {
            console.error('Failed to parse userInfo from localStorage:', e);
          }
        }

        let currentUserData = localUserInfo;

        if (existingSettings && existingSettings.hotelId) {
          // existingSettings가 이미 있는 경우
          setRoomTypes(existingSettings.roomTypes);
          setTotalRooms(existingSettings.totalRooms);
          setIsExisting(true);

          // 로컬 스토리지에서 읽은 userInfo 사용, 없으면 fetch
          if (!currentUserData) {
            currentUserData = await fetchUserInfo(existingSettings.hotelId);
          }

          setAddress(currentUserData?.address || '');
          setPhoneNumber(currentUserData?.phoneNumber || '');
          setEmail(currentUserData?.email || '');
        } else {
          const hotelIdToUse = localStorage.getItem('hotelId') || hotelId;
          if (!hotelIdToUse) return;

          const hotelData = await fetchHotelSettings(hotelIdToUse);

          if (hotelData && hotelData.roomTypes) {
            setRoomTypes(hotelData.roomTypes);
            setTotalRooms(hotelData.totalRooms);
            setIsExisting(true);
          } else {
            setIsExisting(false);
          }

          // 로컬 스토리지에서 읽은 userInfo 사용, 없으면 fetch
          if (!currentUserData) {
            currentUserData = await fetchUserInfo(hotelIdToUse);
          }

          setAddress(currentUserData?.address || '');
          setPhoneNumber(currentUserData?.phoneNumber || '');
          setEmail(currentUserData?.email || '');
        }
      } catch (error) {
        console.error('호텔 설정 불러오기 실패:', error);
        setError('호텔 설정을 불러오는 중 오류가 발생했습니다.');
      }
    };

    loadSettings();
  }, [hotelId, existingSettings]);

  // 객실 타입 변경 처리 함수
  const handleRoomTypeChange = (index, field, value) => {
    const newRoomTypes = [...roomTypes];
    if (field === 'price' || field === 'stock') {
      newRoomTypes[index][field] = value === '' ? '' : Number(value);
    } else if (field === 'aliases') {
      // 문자열을 '||'로 분리하여 배열로 변환
      newRoomTypes[index][field] = value
        .split('||')
        .map((alias) => alias.trim());
    } else if (field === 'type') {
      // 추가: type 필드 처리
      newRoomTypes[index][field] = value;
    } else {
      newRoomTypes[index][field] = value;
    }
    setRoomTypes(newRoomTypes);
  };

  // 객실 타입 추가 함수
  const addRoomType = () => {
    setRoomTypes([
      ...roomTypes,
      {
        type: 'custom-type-' + (roomTypes.length + 1), // 혹은 사용자 입력으로 받음
        nameKor: '',
        nameEng: '',
        price: '',
        stock: '',
        aliases: [],
      },
    ]);
  };

  // 객실 타입 제거 함수
  const removeRoomType = (index) => {
    setRoomTypes(roomTypes.filter((_, i) => i !== index));
  };

  // 저장 버튼 클릭 시 처리 함수
  const handleSave = async () => {
    if (
      !hotelId.trim() ||
      !address.trim() ||
      !phoneNumber.trim() ||
      !email.trim() ||
      !totalRooms
    ) {
      alert(
        '호텔 ID, 총 객실 수, 주소, 전화번호, 이메일은 필수 입력 항목입니다.'
      );
      return;
    }

    // 총 객실 수 유효성 검사
    const normalizedTotalRooms = Number(totalRooms);
    if (isNaN(normalizedTotalRooms) || normalizedTotalRooms < 1) {
      alert('총 객실 수는 유효한 숫자여야 합니다.');
      return;
    }

    // 객실 정보 유효성 검사
    if (
      roomTypes.length === 0 ||
      roomTypes.some(
        (rt) =>
          !rt.nameKor ||
          !rt.nameEng ||
          rt.price === '' ||
          rt.stock === '' ||
          isNaN(rt.price) ||
          isNaN(rt.stock)
      )
    ) {
      alert('유효한 객실 타입, 가격, 재고를 입력하세요.');
      return;
    }

    const normalizedHotelId = hotelId.trim().toLowerCase();

    // 새로운 설정 객체 생성 (OTA 제거)
    const newSettings = {
      hotelId: normalizedHotelId,
      totalRooms: normalizedTotalRooms,
      roomTypes: roomTypes.map((rt) => ({
        ...rt,
        price: Number(rt.price),
        stock: Number(rt.stock),
        nameEng: rt.nameEng ? rt.nameEng.trim() : '',
        nameKor: rt.nameKor ? rt.nameKor.trim() : '',
        aliases: Array.isArray(rt.aliases)
          ? rt.aliases.map((alias) => (alias ? alias.trim().toLowerCase() : ''))
          : [],
      })),
      email: email.trim(),
      address: address.trim(),
      phoneNumber: phoneNumber.trim(),
    };

    console.log('Saving settings from HotelSettings:', newSettings); // 디버깅 로그

    try {
      if (isExisting) {
        // 기존 설정일 경우 업데이트
        await updateHotelSettings(normalizedHotelId, newSettings);
        console.log('Hotel Settings Updated:', newSettings);
        alert('호텔 설정이 성공적으로 업데이트되었습니다.');
      } else {
        // 신규 설정일 경우 등록
        await registerHotel(newSettings);
        console.log('Hotel Settings Registered:', newSettings);
        alert('호텔 설정이 성공적으로 등록되었습니다.');
      }

      // onSave 호출 (필요한 경우)
      if (onSave) {
        onSave(newSettings);
      }

      onClose();
    } catch (error) {
      console.error('호텔 설정 저장 오류:', error);
      alert(`호텔 설정 저장에 실패했습니다: ${error.message}`);
    }
  };

  // 카카오 계정 연동용 핸들러
  const handleKakaoLink = () => {
    if (typeof window !== 'undefined' && window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(process.env.REACT_APP_KAKAO_JS_KEY);
        console.log('Kakao SDK initialized:', window.Kakao.isInitialized());
      }
      // 소셜 연결 전용 콜백
      window.Kakao.Auth.authorize({
        redirectUri: 'http://localhost:3003/auth/kakao/link/callback',
      });
    } else {
      console.error('Kakao SDK not loaded or not in browser environment.');
      setError('카카오 로그인 SDK를 불러올 수 없습니다. (Browser Only)');
    }
  };

  return (
    <div className="hotel-settings-modal">
      <div className="hotel-settings-content">
        <button className="close-button" onClick={onClose} aria-label="닫기">
          &times;
        </button>
        <h2>{isExisting ? '호텔 설정 수정' : '호텔 초기 설정'}</h2>
        {error && <p className="error">{error}</p>}
        {!isExisting && !error && <p className="info">호텔 설정을 해주세요.</p>}

        {/* 호텔 정보 입력 필드 */}
        <input
          type="text"
          placeholder="호텔 ID"
          value={hotelId}
          onChange={(e) => setHotelId(e.target.value)}
          required
          disabled={isExisting} // 기존 설정일 경우 호텔 ID 수정 불가
        />
        <input
          type="number"
          placeholder="총 객실 수"
          value={totalRooms}
          onChange={(e) => setTotalRooms(e.target.value)}
          required
          min="1"
        />
        <input
          type="email"
          placeholder="이메일"
          value={email || ''}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="호텔 주소"
          value={address || ''}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="전화번호 (예: 0507-1388-6901)"
          value={phoneNumber || ''}
          onChange={(e) => setPhoneNumber(e.target.value)}
          required
        />

        <h3>객실 타입 및 가격/재고</h3>
        {/* 객실 타입 입력 필드 */}
        {roomTypes.map((room, index) => (
          <div key={index} className="room-type">
            <input
              type="text"
              placeholder="한글 이름 (예: 스탠다드)"
              value={room.nameKor || ''}
              onChange={(e) =>
                handleRoomTypeChange(index, 'nameKor', e.target.value)
              }
              required
            />
            <input
              type="text"
              placeholder="영어 이름 (예: Standard)"
              value={room.nameEng || ''}
              onChange={(e) =>
                handleRoomTypeChange(index, 'nameEng', e.target.value)
              }
              required
            />
            <input
              type="number"
              placeholder="가격 (예: 100000)"
              value={room.price === '' ? '' : room.price}
              onChange={(e) =>
                handleRoomTypeChange(index, 'price', e.target.value)
              }
              required
            />
            <input
              type="number"
              placeholder="재고 수량"
              value={room.stock === '' ? '' : room.stock}
              onChange={(e) =>
                handleRoomTypeChange(index, 'stock', e.target.value)
              }
              required
            />
            <input
              type="text"
              placeholder="별칭 입력 (예: standard||std)"
              value={
                Array.isArray(room.aliases)
                  ? room.aliases.join('||')
                  : room.aliases || ''
              }
              onChange={(e) =>
                handleRoomTypeChange(index, 'aliases', e.target.value)
              }
            />
            <button
              className="delete-roomType"
              onClick={() => removeRoomType(index)}
              aria-label="객실 타입 삭제"
            >
              &times;
            </button>
          </div>
        ))}
        <div className="buttons_container">
          <button className="add_button" onClick={addRoomType} type="button">
            객실 타입 추가
          </button>
          <div className="buttons">
            <button className="save-button" onClick={handleSave} type="button">
              저장
            </button>
            <button className="cancel-button" onClick={onClose} type="button">
              취소
            </button>
            <button
              className="kakao-link-button"
              onClick={handleKakaoLink}
              type="button"
            >
              카카오 계정 연동
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

HotelSettings.propTypes = {
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func,
  existingSettings: PropTypes.shape({
    hotelId: PropTypes.string,
    totalRooms: PropTypes.number,
    roomTypes: PropTypes.arrayOf(
      PropTypes.shape({
        type: PropTypes.string,
        nameKor: PropTypes.string,
        nameEng: PropTypes.string,
        price: PropTypes.number,
        stock: PropTypes.number,
        aliases: PropTypes.arrayOf(PropTypes.string),
      })
    ),
    email: PropTypes.string,
    address: PropTypes.string,
    phoneNumber: PropTypes.string,
  }),
};

export default HotelSettings;
