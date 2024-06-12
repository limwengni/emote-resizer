import React, { useState } from 'react';
import '../App.css'; // Import the custom styles

const PlatformSelector = ({ onChangePlatform }) => {
  const [platform, setPlatform] = useState('twitch'); // Start with a default platform

  const handlePlatformChange = (e) => {
    const selectedPlatform = e.target.value;
    setPlatform(selectedPlatform);
    onChangePlatform(selectedPlatform); // Notify parent component of platform change
  };

  return (
    <div className="p-2">
      <label className="block mb-2 text-lg text-gray-200">Select Platform:</label>
      <select
        value={platform}
        onChange={handlePlatformChange}
        className="custom-select bg-gray-200"
      >
        <option value="twitch">Twitch</option>
        <option value="discord">Discord</option>
        <option value="youtube">Youtube</option>
      </select>
    </div>
  );
};

export default PlatformSelector;
