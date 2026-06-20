# Data Collectors for Swedish Public APIs

## Directory Structure
```
python/
├── collectors/
│   ├── __init__.py
│   ├── scb_collector.py      # Statistics Sweden
│   ├── lantmateriet_collector.py
│   ├── trafiklab_collector.py
│   ├── skolverket_collector.py
│   ├── bra_collector.py
│   └── smhi_collector.py
├── api.py
└── requirements.txt
```

## SCB Collector (Statistics Sweden)

```python
# scb_collector.py
import httpx
import asyncio
from typing import List, Dict, Any

class SCBCollector:
    BASE_URL = "https://api.scb.se"
    
    async def fetch_population(self, region: str) -> Dict[str, Any]:
        # GET /BE/BE0101 for population data
        pass
    
    async def fetch_income(self, region: str) -> Dict[str, Any]:
        # GET /HE/HE0110 for income statistics
        pass
    
    async def fetch_education(self, region: str) -> Dict[str, Any]:
        # GET /UF/UF0101 for education levels
        pass

# Lantmäteriet Collector

class LantmaterietCollector:
    BASE_URL = "https://api.lantmateriet.se"
    
    async def geocode_address(self, address: str) -> Dict[str, Any]:
        # Address to coordinate lookup
        pass
    
    async def get_boundaries(self) -> Dict[str, Any]:
        # DeSO polygon boundaries
        pass
```

## Trafiklab Collector

```python
class TrafiklabCollector:
    BASE_URL = "https://api.sl.se/api2"
    
    async def get_nearest_stop(self, lat: float, lng: float) -> Dict[str, Any]:
        # SL Stop Lookup
        pass
    
    async def plan_journey(self, from_stop: int, to_stop: int) -> Dict[str, Any]:
        pass
```