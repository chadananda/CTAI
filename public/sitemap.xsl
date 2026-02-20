<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sitemap image">
  <xsl:output method="html" indent="yes" encoding="UTF-8"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>
          <xsl:choose>
            <xsl:when test="sitemap:sitemapindex">Sitemap Index — CTAI</xsl:when>
            <xsl:otherwise>Sitemap — CTAI</xsl:otherwise>
          </xsl:choose>
        </title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'JetBrains Mono', ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
            background: #0a0a0f;
            color: #8a8a9a;
            line-height: 1.6;
            min-height: 100vh;
          }
          .container {
            max-width: 960px;
            margin: 0 auto;
            padding: 3rem 1.5rem;
          }
          header {
            margin-bottom: 2.5rem;
            border-bottom: 1px solid #1a1a2e;
            padding-bottom: 1.5rem;
          }
          h1 {
            font-family: 'Source Serif 4', 'Georgia', serif;
            font-size: 1.5rem;
            font-weight: 600;
            color: #e0e0ea;
            margin-bottom: 0.25rem;
          }
          h1 span { color: #d4a543; }
          .subtitle {
            font-size: 0.7rem;
            color: #4a4a5a;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .stats {
            display: flex;
            gap: 1.5rem;
            margin-top: 1rem;
          }
          .stat {
            font-size: 0.7rem;
            color: #5a5a6a;
          }
          .stat strong {
            color: #d4a543;
            font-weight: 500;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.75rem;
          }
          thead th {
            text-align: left;
            padding: 0.6rem 0.75rem;
            font-size: 0.65rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #5a5a6a;
            border-bottom: 1px solid #1a1a2e;
          }
          tbody tr {
            border-bottom: 1px solid #0f0f1a;
          }
          tbody tr:hover {
            background: #0f0f1a;
          }
          td {
            padding: 0.5rem 0.75rem;
            vertical-align: top;
          }
          a {
            color: #8a8a9a;
            text-decoration: none;
            transition: color 0.15s;
          }
          a:hover { color: #d4a543; }
          .url { word-break: break-all; }
          .priority {
            display: inline-block;
            min-width: 2rem;
            text-align: center;
            padding: 0.15rem 0.4rem;
            border-radius: 3px;
            font-size: 0.65rem;
          }
          .p-high { background: #d4a54318; color: #d4a543; }
          .p-med { background: #5a8a5a18; color: #6a9a6a; }
          .p-low { background: #1a1a2e; color: #5a5a6a; }
          .freq {
            font-size: 0.65rem;
            color: #4a4a5a;
          }
          footer {
            margin-top: 2.5rem;
            padding-top: 1rem;
            border-top: 1px solid #1a1a2e;
            font-size: 0.65rem;
            color: #3a3a4a;
          }
          footer a { color: #5a5a6a; }
          @media (max-width: 640px) {
            .container { padding: 1.5rem 1rem; }
            .hide-mobile { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1><span>CTAI</span> Sitemap</h1>
            <p class="subtitle">Committee Translation AI</p>
            <div class="stats">
              <xsl:choose>
                <xsl:when test="sitemap:sitemapindex">
                  <div class="stat">
                    <strong><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/></strong> sitemap files
                  </div>
                </xsl:when>
                <xsl:otherwise>
                  <div class="stat">
                    <strong><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/></strong> URLs
                  </div>
                </xsl:otherwise>
              </xsl:choose>
            </div>
          </header>

          <xsl:choose>
            <xsl:when test="sitemap:sitemapindex">
              <table>
                <thead>
                  <tr>
                    <th>Sitemap</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
                    <tr>
                      <td class="url">
                        <a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:when>
            <xsl:otherwise>
              <table>
                <thead>
                  <tr>
                    <th>URL</th>
                    <th class="hide-mobile">Priority</th>
                    <th class="hide-mobile">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  <xsl:for-each select="sitemap:urlset/sitemap:url">
                    <xsl:sort select="sitemap:priority" order="descending" data-type="number"/>
                    <tr>
                      <td class="url">
                        <a href="{sitemap:loc}">
                          <xsl:value-of select="substring-after(sitemap:loc, 'https://ctai.info')"/>
                          <xsl:if test="sitemap:loc = 'https://ctai.info' or sitemap:loc = 'https://ctai.info/'">/</xsl:if>
                        </a>
                      </td>
                      <td class="hide-mobile">
                        <xsl:variable name="p" select="sitemap:priority"/>
                        <span>
                          <xsl:attribute name="class">
                            <xsl:text>priority </xsl:text>
                            <xsl:choose>
                              <xsl:when test="$p &gt;= 0.8">p-high</xsl:when>
                              <xsl:when test="$p &gt;= 0.5">p-med</xsl:when>
                              <xsl:otherwise>p-low</xsl:otherwise>
                            </xsl:choose>
                          </xsl:attribute>
                          <xsl:value-of select="sitemap:priority"/>
                        </span>
                      </td>
                      <td class="hide-mobile freq">
                        <xsl:value-of select="sitemap:changefreq"/>
                      </td>
                    </tr>
                  </xsl:for-each>
                </tbody>
              </table>
            </xsl:otherwise>
          </xsl:choose>

          <footer>
            <a href="https://ctai.info">ctai.info</a> — This is an XML sitemap for search engines.
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
