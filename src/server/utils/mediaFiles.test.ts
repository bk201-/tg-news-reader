import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { existsSync, unlinkSync } from 'fs';
import { deleteAllMediaFiles } from './mediaFiles.js';

const mockExistsSync = vi.mocked(existsSync);
const mockUnlinkSync = vi.mocked(unlinkSync);

describe('deleteAllMediaFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when both paths are null', () => {
    deleteAllMediaFiles(null, null);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('deletes single media path', () => {
    mockExistsSync.mockReturnValue(true);
    deleteAllMediaFiles('channel/photo.jpg', null);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(1);
    expect(mockUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('photo.jpg'));
  });

  it('deletes album paths when localMediaPaths is provided', () => {
    mockExistsSync.mockReturnValue(true);
    deleteAllMediaFiles('channel/1.jpg', ['channel/1.jpg', 'channel/2.jpg', 'channel/3.jpg']);
    expect(mockUnlinkSync).toHaveBeenCalledTimes(3);
  });

  it('skips files that do not exist on disk', () => {
    mockExistsSync.mockReturnValue(false);
    deleteAllMediaFiles('channel/gone.jpg', null);
    expect(mockUnlinkSync).not.toHaveBeenCalled();
  });

  it('ignores unlink errors gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockUnlinkSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(() => deleteAllMediaFiles('channel/locked.jpg', null)).not.toThrow();
  });
});
