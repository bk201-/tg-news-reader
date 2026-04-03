import React, { useState, useCallback } from 'react';
import { Modal, Button, Typography } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, HolderOutlined } from '@ant-design/icons';
import { createStyles } from 'antd-style';
import { useTranslation } from 'react-i18next';
import { useIsMd } from '../../hooks/breakpoints';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;

export interface SortItem {
  id: number;
  name: string;
  color?: string;
}

interface SortModalProps {
  open: boolean;
  title: string;
  items: SortItem[];
  onClose: () => void;
  onSave: (items: { id: number; sortOrder: number }[]) => void;
  loading?: boolean;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const useStyles = createStyles(({ css, token }) => ({
  list: css`
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
    max-height: 60vh;
    overflow: hidden;
  `,
  item: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillAlter};
    border: 1px solid ${token.colorBorderSecondary};
    user-select: none;
  `,
  itemDragging: css`
    box-shadow: ${token.boxShadow};
    background: ${token.colorBgElevated};
    border-color: ${token.colorPrimary};
    z-index: 999;
  `,
  dragHandle: css`
    cursor: grab;
    color: ${token.colorTextTertiary};
    font-size: 16px;
    flex-shrink: 0;
    &:active {
      cursor: grabbing;
    }
  `,
  colorDot: css`
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  `,
  name: css`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  arrowBtns: css`
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  `,
}));

// ─── Sortable item (DnD) ─────────────────────────────────────────────────────

function SortableRow({
  item,
  styles,
  cx,
}: {
  item: SortItem;
  styles: ReturnType<typeof useStyles>['styles'];
  cx: ReturnType<typeof useStyles>['cx'];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cx(styles.item, isDragging && styles.itemDragging)}>
      <HolderOutlined className={styles.dragHandle} {...attributes} {...listeners} />
      {item.color && <span className={styles.colorDot} style={{ background: item.color }} />}
      <Text className={styles.name}>{item.name}</Text>
    </div>
  );
}

// ─── Static item (↑↓ buttons, mobile) ────────────────────────────────────────

function StaticRow({
  item,
  index,
  total,
  styles,
  onMoveUp,
  onMoveDown,
}: {
  item: SortItem;
  index: number;
  total: number;
  styles: ReturnType<typeof useStyles>['styles'];
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className={styles.item}>
      {item.color && <span className={styles.colorDot} style={{ background: item.color }} />}
      <Text className={styles.name}>{item.name}</Text>
      <div className={styles.arrowBtns}>
        <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={onMoveUp} />
        <Button size="small" icon={<ArrowDownOutlined />} disabled={index === total - 1} onClick={onMoveDown} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SortModal({ open, title, items: initialItems, onClose, onSave, loading }: SortModalProps) {
  const { t } = useTranslation();
  const { styles, cx } = useStyles();
  const isMobile = !useIsMd(); // < 768px

  const [items, setItems] = useState<SortItem[]>([]);

  // Reset order when modal opens
  React.useEffect(() => {
    if (open) setItems(initialItems);
  }, [open, initialItems]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }, []);

  const moveItem = useCallback((index: number, direction: -1 | 1) => {
    setItems((prev) => arrayMove(prev, index, index + direction));
  }, []);

  const handleSave = () => {
    onSave(items.map((item, idx) => ({ id: item.id, sortOrder: idx })));
  };

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('common.cancel')}
        </Button>,
        <Button key="save" type="primary" loading={loading} onClick={handleSave}>
          {t('common.save')}
        </Button>,
      ]}
      destroyOnHidden
    >
      {isMobile ? (
        <div className={styles.list}>
          {items.map((item, idx) => (
            <StaticRow
              key={item.id}
              item={item}
              index={idx}
              total={items.length}
              styles={styles}
              onMoveUp={() => moveItem(idx, -1)}
              onMoveDown={() => moveItem(idx, 1)}
            />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className={styles.list}>
              {items.map((item) => (
                <SortableRow key={item.id} item={item} styles={styles} cx={cx} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </Modal>
  );
}
