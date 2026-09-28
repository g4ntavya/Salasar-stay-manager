import React, { useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button, SelectField, Sheet, colors } from '../ui';

export interface DateFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const formatDateLabel = (d: Date | null) =>
  d ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

/** Date input: the system dialog on Android, a calendar sheet on iOS. */
export const DateField: React.FC<DateFieldProps> = ({ label, value, onChange, minimumDate, maximumDate, required, style }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  const show = () => {
    const start = value ?? minimumDate ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate,
        maximumDate,
        onValueChange: (_event, date) => onChange(date),
      });
    } else {
      setDraft(start);
      setOpen(true);
    }
  };

  return (
    <>
      <SelectField label={label} value={formatDateLabel(value)} placeholder="Select date" onPress={show} chevron={false} required={required} style={style} />
      {Platform.OS === 'ios' ? (
        <Sheet
          visible={open}
          onClose={() => setOpen(false)}
          title={label}
          footer={
            <Button
              title="Done"
              size="lg"
              fullWidth
              onPress={() => {
                setOpen(false);
                onChange(draft);
              }}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display="inline"
            themeVariant="light"
            accentColor={colors.brand}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_e, d) => setDraft(d)}
          />
        </Sheet>
      ) : null}
    </>
  );
};
