import { useState, useRef, useEffect } from 'react';
import { sellerProductsApi, isValidImageUrl } from '../../services/sellerProductsApi.ts';
import './ImageDropzone.css';

export interface DropzoneImageItem {
  id: string;
  file?: File;
  previewUrl: string;
  url?: string;
  filename: string;
  size?: number;
  isThumbnail: boolean;
  altText: string;
  status: 'READY' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
  error?: string;
  progress?: number;
}

interface ImageDropzoneProps {
  initialImages?: Array<{
    url: string;
    altText?: string | null;
    isThumbnail?: boolean;
  }>;
  maxFiles?: number;
  maxFileSizeMb?: number;
  autoUpload?: boolean;
  onImagesChange?: (images: DropzoneImageItem[]) => void;
  onUploadSuccess?: (uploadedItem: DropzoneImageItem) => void;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function ImageDropzone({
  initialImages = [],
  maxFiles = 8,
  maxFileSizeMb = 5,
  autoUpload = true,
  onImagesChange,
  onUploadSuccess,
}: ImageDropzoneProps) {
  // Input mode: 'FILE' or 'URL'
  const [mode, setMode] = useState<'FILE' | 'URL'>('FILE');

  // File queue items
  const [items, setItems] = useState<DropzoneImageItem[]>(() =>
    initialImages.map((img, idx) => ({
      id: `init-${idx}-${Date.now()}`,
      previewUrl: img.url,
      url: img.url,
      filename: img.url.split('/').pop() || `image-${idx + 1}`,
      isThumbnail: Boolean(img.isThumbnail || idx === 0),
      altText: img.altText || '',
      status: 'UPLOADED',
    }))
  );

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Notify parent of image list changes
  useEffect(() => {
    onImagesChange?.(items);
  }, [items, onImagesChange]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach((item) => {
        if (item.file && item.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(item.previewUrl);
        }
      });
    };
  }, [items]);

  // Upload an individual file queue item
  const uploadItem = async (itemToUpload: DropzoneImageItem) => {
    if (!itemToUpload.file) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemToUpload.id
          ? { ...it, status: 'UPLOADING', progress: 30, error: undefined }
          : it
      )
    );

    try {
      const response = await sellerProductsApi.uploadProductImage(itemToUpload.file);

      setItems((prev) => {
        const next = prev.map((it) => {
          if (it.id === itemToUpload.id) {
            const updated: DropzoneImageItem = {
              ...it,
              status: 'UPLOADED',
              url: response.url,
              filename: response.filename,
              size: response.size,
              progress: 100,
            };
            onUploadSuccess?.(updated);
            return updated;
          }
          return it;
        });
        return next;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemToUpload.id
            ? { ...it, status: 'FAILED', error: msg, progress: 0 }
            : it
        )
      );
    }
  };

  // Process selected files from drop or input
  const processFiles = (fileList: FileList | File[]) => {
    setValidationError(null);
    const files = Array.from(fileList);

    if (items.length + files.length > maxFiles) {
      setValidationError(`Maximum of ${maxFiles} images allowed per product.`);
      return;
    }

    const newItems: DropzoneImageItem[] = [];

    for (const file of files) {
      // 1. Type validation
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_MIME_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
        setValidationError(`Invalid format for "${file.name}". Only JPEG, PNG, and WebP are allowed.`);
        return;
      }

      // 2. Size validation
      const maxBytes = maxFileSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        setValidationError(`"${file.name}" exceeds the ${maxFileSizeMb}MB file size limit.`);
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      const isFirstItem = items.length === 0 && newItems.length === 0;

      const item: DropzoneImageItem = {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        file,
        previewUrl,
        filename: file.name,
        size: file.size,
        isThumbnail: isFirstItem,
        altText: file.name.replace(/\.[^/.]+$/, ''),
        status: autoUpload ? 'READY' : 'READY',
      };

      newItems.push(item);
    }

    setItems((prev) => [...prev, ...newItems]);

    // Automatically trigger upload if enabled
    if (autoUpload) {
      newItems.forEach((it) => uploadItem(it));
    }
  };

  // Drag handlers
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Add external URL handler
  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    if (!isValidImageUrl(trimmed)) {
      setValidationError('Please enter a valid HTTP or HTTPS image URL.');
      return;
    }

    setValidationError(null);
    const isFirstItem = items.length === 0;

    const newItem: DropzoneImageItem = {
      id: `url-${Date.now()}`,
      previewUrl: trimmed,
      url: trimmed,
      filename: trimmed.split('/').pop() || 'external-image',
      isThumbnail: isFirstItem,
      altText: 'Product image',
      status: 'UPLOADED',
    };

    setItems((prev) => [...prev, newItem]);
    setUrlInput('');
    onUploadSuccess?.(newItem);
  };

  // Remove an item
  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target?.file && target.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(target.previewUrl);
      }

      const next = prev.filter((it) => it.id !== id);
      // If removed item was thumbnail, promote the first remaining item
      if (target?.isThumbnail && next.length > 0) {
        next[0].isThumbnail = true;
      }
      return next;
    });
  };

  // Set thumbnail
  const setThumbnail = (id: string) => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        isThumbnail: it.id === id,
      }))
    );
  };

  return (
    <div className="bb-dropzone-container">
      {/* Mode Tabs */}
      <div className="bb-dropzone-mode-tabs">
        <button
          type="button"
          className={`bb-dropzone-mode-tab ${mode === 'FILE' ? 'active' : ''}`}
          onClick={() => setMode('FILE')}
        >
          📁 Drag & Drop File Upload
        </button>
        <button
          type="button"
          className={`bb-dropzone-mode-tab ${mode === 'URL' ? 'active' : ''}`}
          onClick={() => setMode('URL')}
        >
          🔗 Enter Image URL
        </button>
      </div>

      {/* Validation Alert */}
      {validationError && (
        <div className="bb-dropzone-error-alert" role="alert">
          <span>⚠️</span>
          <span>{validationError}</span>
        </div>
      )}

      {/* Drag & Drop Area */}
      {mode === 'FILE' ? (
        <div
          className={`bb-dropzone-area ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          aria-label="Click or drag images to upload"
        >
          <input
            ref={fileInputRef}
            type="file"
            className="bb-dropzone-file-input"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              if (e.target.files) {
                processFiles(e.target.files);
                e.target.value = ''; // Reset input to allow selecting same file again
              }
            }}
          />
          <div className="bb-dropzone-icon">📷</div>
          <p className="bb-dropzone-title">
            Drag and drop images here, or <span>browse from computer</span>
          </p>
          <p className="bb-dropzone-hint">
            Supports JPEG, PNG, and WebP (up to {maxFileSizeMb}MB per file, max {maxFiles} images)
          </p>
        </div>
      ) : (
        <div className="bb-dropzone-url-group">
          <input
            type="url"
            className="bb-dropzone-url-input"
            placeholder="https://example.com/images/product.jpg"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddUrl();
              }
            }}
          />
          <button
            type="button"
            className="bb-dropzone-url-add-btn"
            onClick={handleAddUrl}
          >
            Add URL
          </button>
        </div>
      )}

      {/* Previews & Image Queue */}
      {items.length > 0 && (
        <div className="bb-dropzone-preview-list">
          {items.map((item) => (
            <div
              key={item.id}
              className={`bb-dropzone-preview-card ${item.isThumbnail ? 'is-thumbnail' : ''}`}
            >
              <div className="bb-dropzone-img-wrapper">
                <img
                  src={item.previewUrl}
                  alt={item.altText || item.filename}
                  className="bb-dropzone-img"
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80';
                  }}
                />

                {item.isThumbnail && (
                  <span className="bb-dropzone-thumb-badge active">Thumbnail</span>
                )}

                <div className="bb-dropzone-card-actions">
                  <button
                    type="button"
                    className="bb-dropzone-icon-btn"
                    onClick={() => removeItem(item.id)}
                    title="Remove image"
                    aria-label={`Remove ${item.filename}`}
                  >
                    ✕
                  </button>
                </div>

                {/* Upload Progress Overlay */}
                {item.status === 'UPLOADING' && (
                  <div className="bb-dropzone-upload-overlay">
                    <div className="bb-dropzone-progress-bar">
                      <div
                        className="bb-dropzone-progress-fill"
                        style={{ width: `${item.progress || 30}%` }}
                      />
                    </div>
                    <span className="bb-dropzone-progress-text">Uploading...</span>
                  </div>
                )}
              </div>

              {/* Card Details */}
              <div className="bb-dropzone-preview-details">
                <p className="bb-dropzone-preview-filename" title={item.filename}>
                  {item.filename}
                </p>
                {item.size && (
                  <span className="bb-dropzone-preview-filesize">
                    {(item.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                )}

                {/* Status Indicator */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {item.status === 'UPLOADED' && (
                    <span className="bb-dropzone-status-pill uploaded">✓ Ready</span>
                  )}
                  {item.status === 'READY' && (
                    <span className="bb-dropzone-status-pill ready">Queued</span>
                  )}
                  {item.status === 'FAILED' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="bb-dropzone-status-pill failed" title={item.error}>
                        Failed
                      </span>
                      <button
                        type="button"
                        onClick={() => uploadItem(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '11px',
                          color: '#2563eb',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* Select Thumbnail Radio */}
                <label className="bb-dropzone-thumb-select-label">
                  <input
                    type="radio"
                    name="dropzone-thumbnail-select"
                    checked={item.isThumbnail}
                    onChange={() => setThumbnail(item.id)}
                  />
                  <span>Set as primary thumbnail</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
