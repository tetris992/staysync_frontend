// src/components/InvoiceModal.js
import React, { useState } from 'react';
import Modal from 'react-modal';
import PropTypes from 'prop-types';
import { FaDownload, FaPrint, FaTimes, FaEdit, FaSave } from 'react-icons/fa';
import './InvoiceModal.css';
import InvoiceTemplate from './InvoiceTemplate.js';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
// react-i18next, LanguageSwitcher 등 다국어 관련 import 모두 제거

const InvoiceModal = ({
  isOpen,
  onRequestClose,
  invoiceRef,
  reservationNo,
  reservation,
  hotelAddress,
  phoneNumber,
  email,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedReservation, setEditedReservation] = useState({
    ...reservation,
  });

  // 인보이스 다운로드 핸들러
  const handleDownload = async () => {
    try {
      const input = invoiceRef.current;
      const canvas = await html2canvas(input);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF();

      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // 예약자 이름으로 파일명 생성
      const customerName = editedReservation.customerName || 'Invoice';
      const sanitizedCustomerName = customerName
        .replace(/[^a-z0-9가-힣]+/gi, '_')
        .toLowerCase();
      const fileName = `Invoice_${sanitizedCustomerName}.pdf`;

      pdf.save(fileName);
      onRequestClose();
    } catch (error) {
      console.error('인보이스 다운로드 실패:', error);
      alert('PDF 다운로드에 실패했습니다.'); // 한국어 고정 메시지
    }
  };

  // 인보이스 프린트 핸들러
  const handlePrint = () => {
    const input = invoiceRef.current;
    const printContents = input.innerHTML;
    const originalContents = document.body.innerHTML;

    document.body.innerHTML = printContents;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  // 수정 모드 토글
  const toggleEditMode = () => {
    setIsEditing((prev) => !prev);
  };

  // 수정 후 저장 핸들러
  const handleSave = () => {
    // 실제 API 호출 등은 필요시 구현
    setIsEditing(false);
    onRequestClose();
  };

  // InvoiceTemplate 내부에서 호출될 데이터 변경 핸들러
  const handleChange = (field, value) => {
    setEditedReservation((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={() => {
        setIsEditing(false);
        onRequestClose();
      }}
      contentLabel="인보이스 발행" // 한글로 고정
      className="invoice-modal-content"
      overlayClassName="invoice-modal-overlay"
    >
      <div className="modal-header">
        <h2>인보이스</h2>
        <button
          onClick={() => {
            setIsEditing(false);
            onRequestClose();
          }}
          className="close-button"
          aria-label="닫기"
        >
          <FaTimes size={20} />
        </button>
      </div>

      <div className="modal-body">
        <div ref={invoiceRef} className="invoice-content">
          <InvoiceTemplate
            reservation={editedReservation}
            hotelAddress={hotelAddress || '정보 없음'}
            phoneNumber={phoneNumber || '정보 없음'}
            email={email || '정보 없음'}
            isEditing={isEditing}
            toggleEditMode={toggleEditMode}
            handleSave={handleSave}
            handleChange={handleChange}
          />
        </div>
      </div>

      <div className="modal-footer">
        {!isEditing ? (
          <button onClick={toggleEditMode} className="modal-button">
            <FaEdit /> 수정
          </button>
        ) : (
          <button onClick={handleSave} className="modal-button">
            <FaSave /> 저장
          </button>
        )}
        <button
          onClick={handleDownload}
          className="modal-button"
          aria-label="다운로드"
        >
          <FaDownload /> 다운로드
        </button>
        <button
          onClick={handlePrint}
          className="modal-button"
          aria-label="인쇄"
        >
          <FaPrint /> 인쇄
        </button>
      </div>
    </Modal>
  );
};

InvoiceModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onRequestClose: PropTypes.func.isRequired,
  invoiceRef: PropTypes.object.isRequired,
  reservationNo: PropTypes.string.isRequired,
  reservation: PropTypes.object.isRequired,
  hotelAddress: PropTypes.string.isRequired,
  phoneNumber: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
};

export default InvoiceModal;
