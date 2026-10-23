from tests.conftest import login


async def test_health(client):
    r = await client.get("/health")
    assert r.json()["ok"] is True


async def test_me_and_profile(client, auth):
    me = (await client.get("/auth/me", headers=auth)).json()
    assert me["tenant"]["industry"] == "home-services"
    prof = (await client.get("/settings/profile", headers=auth)).json()
    assert prof["profile"]["business_name"] == "Brightline Plumbing & Heating"
    assert prof["version"] >= 1


async def test_tenant_isolation(client, auth):
    other = await login(client, "aligned-clinic@receptra.ai")
    calls = (await client.get("/calls", headers=auth)).json()["items"]
    assert calls, "seeded calls expected"
    r = await client.get(f"/calls/{calls[0]['id']}", headers=other)
    assert r.status_code == 404
    contacts = (await client.get("/contacts", headers=auth)).json()
    r = await client.patch(f"/contacts/{contacts[0]['id']}", json={"blocked": True}, headers=other)
    assert r.status_code == 404
    assert (await client.get("/calls", headers=other)).json()["total"] == 0


async def test_unauthenticated(client):
    assert (await client.get("/calls")).status_code == 401


async def test_profile_update_versions(client, auth):
    prof = (await client.get("/settings/profile", headers=auth)).json()
    p = prof["profile"]
    p["tone"] = "cheerful and brief"
    r = await client.put("/settings/profile", json=p, headers=auth)
    assert r.json()["version"] == prof["version"] + 1
    prompt = (await client.get("/settings/prompt-preview", headers=auth)).json()["prompt"]
    assert "cheerful and brief" in prompt
    versions = (await client.get("/settings/versions", headers=auth)).json()
    assert versions[0]["version"] == prof["version"] + 1


async def test_signup_from_preset(client):
    r = await client.post("/auth/signup", json={
        "business_name": "Pawfect Grooming", "industry": "salon", "email": "owner@pawfect-grooming.com", "password": "pw123456"})
    assert r.status_code == 200, r.text
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    prof = (await client.get("/settings/profile", headers=h)).json()["profile"]
    assert prof["industry"] == "salon" and prof["services"]


async def test_presets_listed(client):
    keys = {p["key"] for p in (await client.get("/presets")).json()}
    assert {"home-services", "clinic", "legal-intake", "event-hire", "generic"} <= keys


async def test_analytics_and_usage(client, auth):
    a = (await client.get("/analytics/summary", headers=auth)).json()
    assert a["total_calls"] > 0 and "BOOKED" in a["by_outcome"]
    u = (await client.get("/billing/usage", headers=auth)).json()
    assert u["minutes"] > 0 and len(u["projection"]) == 3


async def test_create_contact_and_message(client, auth):
    r = await client.post("/contacts", json={"name": "New Lead", "phone": "+44 7700 900 999"}, headers=auth)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["phone"] == "+447700900999"
    assert (await client.post("/contacts", json={"phone": "+447700900999"}, headers=auth)).status_code == 409
    r = await client.post(f"/contacts/{cid}/messages", json={"body": "Hi, following up on your enquiry"}, headers=auth)
    assert r.status_code == 200 and r.json()["status"] in ("sent", "simulated")
    thread = (await client.get(f"/contacts/{cid}/messages", headers=auth)).json()
    assert thread and thread[-1]["body"].startswith("Hi, following")
    other = await login(client, "aligned-clinic@receptra.ai")
    assert (await client.post(f"/contacts/{cid}/messages", json={"body": "x"}, headers=other)).status_code == 404
