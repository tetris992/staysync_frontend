// src/components/InvoiceTemplate.js
import React from 'react';
import PropTypes from 'prop-types';
import './InvoiceTemplate.css'; 
// react-i18next 등 다국어 관련 전혀 사용 안 함

const InvoiceTemplate = ({
  reservation,
  hotelAddress,
  phoneNumber,
  email,
  isEditing,
  toggleEditMode,
  handleSave,
  handleChange,
}) => {
  const {
    reservationNo,
    customerName,
    checkIn,
    checkOut,
    price,
    reservationDate,
    roomInfo,
    specialRequests,
    nightlyRates,
  } = reservation;

  // 가격 추출 함수
  const extractPrice = (priceString) => {
    if (priceString == null) return 0;
    if (typeof priceString === 'number') return priceString;
    if (typeof priceString !== 'string') return 0;

    const salePriceMatch = priceString.match(/판매가\s*([\d,]+)/);
    if (salePriceMatch && salePriceMatch[1]) {
      return parseInt(salePriceMatch[1].replace(/,/g, ''), 10);
    }

    const krwPriceMatch = priceString.match(/KRW\s*([\d,]+)/);
    if (krwPriceMatch && krwPriceMatch[1]) {
      return parseInt(krwPriceMatch[1].replace(/,/g, ''), 10);
    }

    const matches = priceString.match(/[\d,]+/g);
    if (matches && matches.length > 0) {
      const numbers = matches.map((s) => parseInt(s.replace(/,/g, ''), 10));
      return Math.max(...numbers);
    }

    return 0;
  };

  // roomInfo 가공 함수
  const processRoomInfo = (info) => {
    if (!info) return '정보 없음';

    // 괄호 안 내용 제거
    let processed = info.replace(/\([^)]*\)/g, '  ');

    // 하이픈(-) 뒤의 내용 제거
    if (processed.includes('-')) {
      processed = processed.split('-')[0].trim();
    }

    processed = processed.replace(/\s+/g, ' ');
    return processed || '정보 없음';
  };

  // 합계 계산
  const totalPrice = nightlyRates
    ? nightlyRates.reduce(
        (acc, curr) => acc + (typeof curr.rate === 'number' ? curr.rate : 0),
        0
      )
    : extractPrice(price);

  return (
    <div className="invoice-template">
      <div className="invoice-header">
        <h1>인보이스</h1>
        <p>
          <strong>호텔 주소:</strong> {hotelAddress || '정보 없음'}
        </p>
      </div>

      <div className="invoice-details">
        <p>
          <strong>예약번호:</strong> {reservationNo || '정보 없음'}
        </p>
        <p>
          <strong>예약자명:</strong>{' '}
          {isEditing ? (
            <input
              type="text"
              name="customerName"
              value={customerName}
              onChange={(e) => handleChange('customerName', e.target.value)}
            />
          ) : (
            customerName || '정보 없음'
          )}
        </p>
        <p>
          <strong>체크인:</strong>{' '}
          {isEditing ? (
            <input
              type="date"
              name="checkIn"
              value={checkIn}
              onChange={(e) => handleChange('checkIn', e.target.value)}
            />
          ) : (
            checkIn || '정보 없음'
          )}
        </p>
        <p>
          <strong>체크아웃:</strong>{' '}
          {isEditing ? (
            <input
              type="date"
              name="checkOut"
              value={checkOut}
              onChange={(e) => handleChange('checkOut', e.target.value)}
            />
          ) : (
            checkOut || '정보 없음'
          )}
        </p>
        <p>
          <strong>예약일자:</strong>{' '}
          {isEditing ? (
            <input
              type="date"
              name="reservationDate"
              value={reservationDate}
              onChange={(e) => handleChange('reservationDate', e.target.value)}
            />
          ) : (
            reservationDate || '정보 없음'
          )}
        </p>
        <p>
          <strong>객실 정보:</strong>{' '}
          {isEditing ? (
            <input
              type="text"
              name="roomInfo"
              value={roomInfo}
              onChange={(e) => handleChange('roomInfo', e.target.value)}
            />
          ) : (
            processRoomInfo(roomInfo)
          )}
        </p>
        <p>
          <strong>요청 사항:</strong>{' '}
          {isEditing ? (
            <input
              name="specialRequests"
              value={specialRequests}
              onChange={(e) => handleChange('specialRequests', e.target.value)}
            />
          ) : (
            specialRequests || '없음'
          )}
        </p>
        <p>
          <strong>전화번호:</strong> {phoneNumber || '정보 없음'}
        </p>
        <p>
          <strong>이메일:</strong> {email || '정보 없음'}
        </p>
      </div>

      {nightlyRates && nightlyRates.length > 0 ? (
        <div className="invoice-nightly-rates">
          <h4>1박 요금 내역</h4>
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>요금</th>
              </tr>
            </thead>
            <tbody>
              {nightlyRates.map((rate, idx) => (
                <tr key={idx}>
                  <td>{rate.date || '정보 없음'}</td>
                  <td>{rate.rate ? rate.rate.toLocaleString() : '0'}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>총합</strong>
                </td>
                <td>
                  <strong>{totalPrice.toLocaleString()}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="invoice-single-rate">
          <h4>금액</h4>
          <p>{totalPrice.toLocaleString()}</p>
        </div>
      )}

      <div className="invoice-footer">
        <p>이용해주셔서 감사합니다.</p>
      </div>
    </div>
  );
};

InvoiceTemplate.propTypes = {
  reservation: PropTypes.object.isRequired,
  hotelAddress: PropTypes.string.isRequired,
  phoneNumber: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  isEditing: PropTypes.bool.isRequired,
  toggleEditMode: PropTypes.func.isRequired,
  handleSave: PropTypes.func.isRequired,
  handleChange: PropTypes.func.isRequired,
};

export default InvoiceTemplate;
