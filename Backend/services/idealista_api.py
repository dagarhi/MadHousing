import requests
import os
import time
from dotenv import load_dotenv

load_dotenv()

class IdealistaAPI:
    def __init__(self):
        self.api_key = os.getenv("IDEALISTA_API_KEY")
        self.secret = os.getenv("IDEALISTA_SECRET")
        self.token = None
    
    def get_access_token(self):
        try:
            auth = requests.auth.HTTPBasicAuth(self.api_key, self.secret)
            response = requests.post(
                "https://api.idealista.com/oauth/token",
                data={'grant_type': 'client_credentials'},
                auth=auth
            )
            response.raise_for_status()
            self.token = response.json()['access_token']
            return self.token
        except Exception as e:
            print(f"Error obteniendo token: {e}")
            return None
    
    def search_by_area(self, locationId=None, center=None, distance=None,
                   operation="rent", property_type="homes",
                   max_items=50, num_pages=2):
        if not self.token:
            if not self.get_access_token():
                return {"error": "No se pudo obtener token de acceso"}

        headers = {'Authorization': f'Bearer {self.token}'}
        params_base = {
            "country": "es",
            "operation": operation,
            "propertyType": property_type,
            "maxItems": max_items,
            "locale": "es"
        }

        if locationId:
            params_base["locationId"] = locationId
        elif center and distance:
            params_base["center"] = center
            params_base["distance"] = distance
        else:
            return {"error": "Debe indicarse locationId o center+distance"}

        all_results = []
        for page in range(1, num_pages + 1):
            params = {**params_base, "numPage": page}
            try:
                response = requests.post(
                    "https://api.idealista.com/3.5/es/search",
                    headers=headers,
                    data=params
                )
                response.raise_for_status()
                data = response.json()
                element_list = data.get("elementList", [])
                if not element_list:
                    break
                all_results.extend(element_list)
            except Exception as e:
                print(f"Error en página {page}: {e}")
                break
            time.sleep(0.5)  # evitar límites de tasa

        return {"elementList": all_results, "total": len(all_results)}
