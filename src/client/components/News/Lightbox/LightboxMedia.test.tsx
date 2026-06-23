import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LightboxMedia } from './LightboxMedia';

describe('LightboxMedia', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('disables PiP/remote playback and suppresses native context menu for video', () => {
    render(
      <LightboxMedia
        path="channel/video.mp4"
        isAlbum={false}
        albumIndex={0}
        albumPaths={undefined}
        videoRef={{ current: null }}
      />,
    );

    const mediaEl = document.querySelector('video');
    expect(mediaEl).not.toBeNull();
    if (!mediaEl) return;

    expect(mediaEl.hasAttribute('disablePictureInPicture')).toBe(true);
    expect(mediaEl.hasAttribute('disableRemotePlayback')).toBe(true);
    expect(mediaEl.getAttribute('controlsList')).toContain('nopictureinpicture');

    const dispatched = fireEvent.contextMenu(mediaEl);
    expect(dispatched).toBe(false);
  });
});
