import React, { useState } from 'react';
import pica from 'pica';
import JSZip from 'jszip';
import { parseGIF, decompressFrames } from 'gifuct-js';
import GIF from 'gif.js.optimized';
import '../App.css'; // Import the custom styles
import PlatformSelector from './PlatformSelector'; // Assuming PlatformSelector is in a separate file

const FileUploader = () => {
  const [files, setFiles] = useState([]);
  const [platform, setPlatform] = useState('twitch'); // Start with a default platform
  const [processedFiles, setProcessedFiles] = useState([]);

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    const processed = await Promise.all(
      selectedFiles.map((file) => processFile(file, platform))
    );
    setProcessedFiles(processed.flat());
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const processed = await Promise.all(
      droppedFiles.map((file) => processFile(file, platform))
    );
    setProcessedFiles(processed.flat());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processFile = async (file, selectedPlatform) => {
    const sizes = {
      twitch: {
        emotes: [{ size: 28, maxSize: 100 }, { size: 56, maxSize: 100 }, { size: 112, maxSize: 100 }],
        badges: [{ size: 18, maxSize: 25 }, { size: 36, maxSize: 25 }, { size: 72, maxSize: 25 }],
      },
      discord: {
        emotes: [{ size: 128, maxSize: 256 }],
        badges: [{ size: 64, maxSize: 256 }],
      },
      youtube: {
        emotes: [{ size: 32, maxSize: 1000 }],
        badges: [{ size: 32, maxSize: 1000 }],
      },
    };

    const processImage = async (file, { size, maxSize }) => {
      const picaInstance = pica();
      const isGIF = file.type === 'image/gif';

      if (isGIF) {
        return processGif(file, size);
      } else {
        return processStaticImage(file, size);
      }
    };

    const processStaticImage = async (file, size) => {
      const picaInstance = pica();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = size;
      canvas.height = size;

      try {
        const dataURL = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(file);
        });

        const img = new Image();
        img.src = dataURL;

        await new Promise((resolve) => {
          img.onload = resolve;
        });

        await picaInstance.resize(img, canvas);

        return new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
              return;
            }
            const resizedFileName = `${file.name.split('.')[0]}_${size}x${size}.${file.type.split('/')[1]}`;
            const resizedFile = new File([blob], resizedFileName, { type: file.type });
            resolve(resizedFile);
          }, file.type);
        });
      } catch (error) {
        console.error('Error processing image:', error);
        throw error;
      }
    };

    const processGif = async (file, size) => {
      const picaInstance = pica();

      try {
        // Step 1: Read the GIF file as an ArrayBuffer
        const arrayBuffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (error) => reject(error);
          reader.readAsArrayBuffer(file);
        });

        // Step 2: Parse the GIF into frames
        const gif = parseGIF(arrayBuffer);
        const frames = decompressFrames(gif, true);

        // Step 3: Resize each frame asynchronously
        const resizedFrames = await Promise.all(
          frames.map(async (frame) => {
            // Create a temporary canvas for the current frame
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            tempCanvas.width = frame.dims.width;
            tempCanvas.height = frame.dims.height;

            // Put the frame's pixel data onto the temporary canvas
            const imageData = new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height);
            tempCtx.putImageData(imageData, 0, 0);

            // Create a target canvas for resized frame
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            // Clear canvas and set transparency
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'destination-over'; // Place new drawings behind existing content
            ctx.fillStyle = 'rgba(0, 0, 0, 0)'; // Fully transparent black
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Resize using pica library
            await picaInstance.resize(tempCanvas, canvas, {
              unsharpAmount: 0,
              unsharpThreshold: 0,
              alpha: true,
            });

            // Explicitly preserve black outlines
            const resizedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = resizedImageData.data;

            for (let i = 0; i < pixels.length; i += 4) {
              // Check if the pixel is black or close to black
              if (pixels[i] < 10 && pixels[i + 1] < 10 && pixels[i + 2] < 10) {
                pixels[i] = 5;   // Red channel (set to black)
                pixels[i + 1] = 5; // Green channel (set to black)
                pixels[i + 2] = 5; // Blue channel (set to black)
              }
            }

            ctx.putImageData(resizedImageData, 0, 0);

            // Return the modified canvas
            return canvas;
          })
        );

        // Step 4: Create a new GIF encoder with worker script path
        const gifEncoder = new GIF({
          workers: 2,
          quality: 10,
          transparent: 'rgba(0, 0, 0, 0)', // Fully transparent black
          workerScript: process.env.PUBLIC_URL + '/gif.worker.js',
          globalPalette: true
        });

        // Add resized frames to the GIF encoder with correct delays and disposal methods
        resizedFrames.forEach((canvas, index) => {
          const frame = frames[index];
          gifEncoder.addFrame(canvas, { delay: frame.delay, dispose: 2 });
        });

        // Step 5: Generate the resized GIF blob and return as a File object
        return new Promise((resolve) => {
          gifEncoder.on('finished', (blob) => {
            const resizedFileName = `${file.name.split('.')[0]}_${size}x${size}.gif`;
            const resizedFile = new File([blob], resizedFileName, { type: 'image/gif' });
            resolve(resizedFile);
          });
          gifEncoder.render();
        });
      } catch (error) {
        console.error('Error processing GIF:', error);
        throw error;
      }
    };

    let processedFiles = [];

    if (sizes[selectedPlatform].emotes.length > 0) {
      const processedEmotes = await Promise.all(
        sizes[selectedPlatform].emotes.map((sizeConfig) => processImage(file, sizeConfig))
      );
      processedFiles.push({ type: 'emote', files: processedEmotes });
    }

    if (sizes[selectedPlatform].badges.length > 0) {
      const processedBadges = await Promise.all(
        sizes[selectedPlatform].badges.map((sizeConfig) => processImage(file, sizeConfig))
      );
      processedFiles.push({ type: 'badge', files: processedBadges });
    }

    return processedFiles;
  };

  const handleButtonClick = () => {
    document.getElementById('hidden-file-input').click();
  };

  const handleChangePlatform = (selectedPlatform) => {
    setPlatform(selectedPlatform);
  };

  const handleDownload = (file) => {
    // Create a URL for the file blob
    const url = URL.createObjectURL(file);

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name; // Set the file name for download
    document.body.appendChild(a); // Append anchor to body
    a.click(); // Click to trigger download
    document.body.removeChild(a); // Clean up anchor element
    URL.revokeObjectURL(url); // Revoke the object URL
  };

  const handleClearFiles = () => {
    setProcessedFiles([]); // Clear processed files state
  };

  const handleSaveAllAsZip = () => {
    // Create a new JSZip instance
    const zip = new JSZip();

    // Add all processed files to the zip archive
    processedFiles.forEach((group, groupIndex) => {
      group.files.forEach((file, fileIndex) => {
        // Generate a unique name for each file in the zip
        const fileName = `${file.name.split('.')[0]}.${file.name.split('.').pop()}`;
        zip.file(fileName, file);
      });
    });

    // Generate the zip file asynchronously
    zip.generateAsync({ type: 'blob' }).then((content) => {
      // Create a URL for the zip file blob
      const url = URL.createObjectURL(content);

      // Create a temporary anchor element
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resized_img.zip'; // Set the file name for download
      document.body.appendChild(a); // Append anchor to body
      a.click(); // Click to trigger download
      document.body.removeChild(a); // Clean up anchor element
      URL.revokeObjectURL(url); // Revoke the object URL
    });
  };

  // Extracting last emote and badge logic
  const emotes = processedFiles.filter(group => group.type === 'emote').flatMap(group => group.files);
  const badges = processedFiles.filter(group => group.type === 'badge').flatMap(group => group.files);
  const lastEmote = emotes.length > 0 ? emotes[emotes.length - 1] : null;
  const lastBadge = badges.length > 0 ? badges[badges.length - 1] : null;

  return (
    <div>
      <PlatformSelector onChangePlatform={handleChangePlatform} />
      <div
        className="upload-container m-2 p-8 flex flex-col items-center justify-center bg-zinc-900 rounded"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {processedFiles.length === 0 ? (
          <>
            <div
              className="text-center text-2xl font-bold mb-4 text-gray-200"
            >
              Drop Image Here
            </div>
            <div className="text-center mb-4 font-bold text-gray-200">OR</div>
            <input
              type="file"
              id="hidden-file-input"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleButtonClick}
              className="bg-gray-700 text-white font-bold py-2 px-4 rounded"
            >
              Choose Files
            </button>
          </>
        ) : (
          <div className="w-full">
            <div className="flex items-center justify-center mt-2">
              <div className="flex flex-row items-center justify-center">
                <div className="mt-2 border rounded w-72 bg-white p-2 h-10 flex items-center mx-2">
                  <div className="flex justify-between items-center w-full">
                    {lastBadge && (
                      <div className="flex items-center">
                        <span className="text-sm mr-1 text-gray-800">12:00</span>
                        <img
                          src={URL.createObjectURL(lastBadge)}
                          alt={lastBadge.name}
                          className="object-contain h-5 w-5 mr-1"
                        />
                        <span className="text-sm font-bold text-sky-600">akirac</span>
                        <span className="text-sm font-bold text-gray-800">:</span>
                        {lastEmote && (
                          <div className="flex items-center ml-2">
                            <img
                              src={URL.createObjectURL(lastEmote)}
                              alt={lastEmote.name}
                              className="object-contain h-7 w-7"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 border-zinc-800 rounded w-72 bg-zinc-800 p-2 h-10 flex items-center mx-2">
                  <div className="flex justify-between items-center w-full">
                    {lastBadge && (
                      <div className="flex items-center">
                        <span className="text-sm mr-1 text-slate-200">12:00</span>
                        <img
                          src={URL.createObjectURL(lastBadge)}
                          alt={lastBadge.name}
                          className="object-contain h-5 w-5 mr-1"
                        />
                        <span className="text-sm font-bold text-sky-600">akirac</span>
                        <span className="text-sm font-bold text-slate-200">:</span>
                        {lastEmote && (
                          <div className="flex items-center ml-2">
                            <img
                              src={URL.createObjectURL(lastEmote)}
                              alt={lastEmote.name}
                              className="object-contain h-7 w-7"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div>
              {processedFiles.map((group, groupIndex) => (
                <div key={groupIndex}>
                  <div className="text-gray-200 mt-2 mb-2 font-bold">
                    {group.type === 'emote' ? 'Emotes' : 'Badges'}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.files.map((file, fileIndex) => (
                      <div
                        key={`${groupIndex}-${fileIndex}`}
                        className="relative h-40"
                        onClick={() => handleDownload(file)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Container for the entire item */}
                        <div className="row1 flex flex-col items-center justify-between h-32 bg-zinc-800">
                          {/* Image container */}
                          <div className="img-container flex items-center justify-center">
                            <div className="img-container">
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          </div>
                        </div>
                        {/* Description container */}
                        <div className="row2 text-center text-gray-200 bg-slate-700 rounded-b-md px-2 py-1 flex justify-between items-center h-8 absolute bottom-0 left-0 right-0">
                          <span className="text-xs">
                            {file.name.match(/_(\d+x\d+)\./)[1] + "px"}
                          </span>
                          <span className="text-xs font-bold">
                            {(file.size / 1024).toFixed(2)} KB
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="bottom-0 right-0 mb-4 mr-4 mt-4">
              <button
                type="button"
                onClick={handleClearFiles}
                className="bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Clear Files
              </button>
              <button
                type="button"
                onClick={handleSaveAllAsZip}
                className="bg-gray-700 text-white font-bold py-2 px-4 rounded ml-4"
              >
                Save All (.zip)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto p-2">
        <span className="text-gray-200">Note: Image processing is done in your browser. Your image never leaves your device.</span>
      </div>
    </div>
  );
};

export default FileUploader;