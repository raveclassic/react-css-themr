import PropTypes from 'prop-types'

export const ThemeShape = PropTypes.shape({
  theme: PropTypes.object.isRequired
})

export type TTheme = {
  [field: string]: string | TTheme
}

export default ThemeShape