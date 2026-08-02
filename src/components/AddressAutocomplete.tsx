import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary, APIProvider } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_API_KEY } from '../lib/maps';

interface Props {
  onPlaceSelect: (place: google.maps.places.PlaceResult | null) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

function AutocompleteInput({ onPlaceSelect, placeholder, className, defaultValue }: Props) {
  const [inputValue, setInputValue] = useState(defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const options = {
      fields: ['geometry', 'name', 'formatted_address'],
      componentRestrictions: { country: 'py' }
    };

    const autocompleteObj = new places.Autocomplete(inputRef.current, options);
    setAutocomplete(autocompleteObj);

    autocompleteObj.addListener('place_changed', () => {
      const place = autocompleteObj.getPlace();
      if (place.formatted_address) {
         setInputValue(place.formatted_address);
      } else if (place.name) {
         setInputValue(place.name);
      }
      onPlaceSelect(place);
    });

    return () => {
      if (autocompleteObj) {
        google.maps.event.clearInstanceListeners(autocompleteObj);
      }
    };
  }, [places, onPlaceSelect]);

  useEffect(() => {
    setInputValue(defaultValue || '');
  }, [defaultValue]);

  return (
    <input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        if (e.target.value === '') {
          onPlaceSelect(null);
        }
      }}
      placeholder={placeholder}
      className={className}
    />
  );
}

export default function AddressAutocomplete(props: Props) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <AutocompleteInput {...props} />
    </APIProvider>
  );
}
