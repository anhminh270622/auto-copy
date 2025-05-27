import React from 'react';
import "./style.css";

const CheckBox = ({ checked = true, onChange }) => {
    return (
        <label className="container">
            <input type="checkbox" checked={checked} onChange={onChange} />
            <div className={`checkmark ${checked ? 'checked' : ''}`}></div>
        </label>
    );
};

export default CheckBox;
