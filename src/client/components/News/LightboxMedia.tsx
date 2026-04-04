import React, { useEffect } from 'react';
import { createStyles } from 'antd-style';
import { LoadingOutlined } from '@ant-design/icons';
import { mediaUrl } from '../../api/mediaUrl';

interface LightboxMediaProps {
  path: string | undefined;
  isVideo: boolean;
  isAlbum: boolean;
  albumIndex: number;
  albumPaths: string[] | undefined;
  /** Passed up to allow seek on keyboard events */
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const useStyles = createStyles(({ css }) => ({
  wrap: css`
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    user-select: none;
  `,
  img: css`
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    display: block;
  `,
  video: css`
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    display: block;
    outline: none;
  `,
  spinner: css`
    font-size: 40px;
    color: rgba(255, 255, 255, 0.45);
  `,
}));

export function LightboxMedia({ path, isVideo, isAlbum, albumIndex, albumPaths, videoRef }: LightboxMediaProps) {
  const { styles } = useStyles();

  // Set initial volume on mount / path change
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = 0.5;
    }
  }, [path, videoRef]);

  if (!path) {
    return (
      <div className={styles.wrap}>
        <LoadingOutlined className={styles.spinner} />
      </div>
    );
  }

  const displayPath = isAlbum && albumPaths ? (albumPaths[albumIndex] ?? path) : path;

  return (
    <div className={styles.wrap}>
      {isVideo ? (
        <video
          ref={videoRef}
          key={displayPath}
          src={mediaUrl(displayPath)}
          className={styles.video}
          autoPlay
          loop
          controls={false}
          playsInline
        />
      ) : (
        <img key={displayPath} src={mediaUrl(displayPath)} alt="" className={styles.img} draggable={false} />
      )}
    </div>
  );
}
