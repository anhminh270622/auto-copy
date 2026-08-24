import React from 'react';
import "./style.css";

const CheckBox = ({ checked = true, onChange, disabled = false }) => {
    return (
        <label className={`checkbox-container ${disabled ? 'disabled' : ''}`}>
            <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
            <div className={`checkmark ${checked ? 'checked' : ''}`}></div>
        </label>
    );
};

export default CheckBox;
